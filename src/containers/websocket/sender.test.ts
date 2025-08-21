import { Sender } from './sender'
import type { IConnection, ConnectionEvent } from './connection'
import { SyncEvent } from '@/sync-event'
import { waitForMs } from '@/helpers/time'

/**
 * Mock IConnection 实现，专门为 Sender 测试设计
 */
class MockConnectionForSender implements IConnection {
  #ev = new SyncEvent<ConnectionEvent>()

  #isConnected = true

  #shouldFailOnSend = false

  #ackDelay = 10

  #sentMessages: { messageId: string; data: any }[] = []

  get subscriber() {
    return this.#ev.subscriber
  }

  /**
   * 配置发送是否失败
   */
  setShouldFailOnSend(shouldFail: boolean) {
    this.#shouldFailOnSend = shouldFail
  }

  /**
   * 设置 ACK 响应延迟
   */
  setAckDelay(delay: number) {
    this.#ackDelay = delay
  }

  /**
   * 设置连接状态
   */
  setConnected(connected: boolean) {
    this.#isConnected = connected
  }

  /**
   * 获取已发送的消息列表
   */
  getSentMessages() {
    return [...this.#sentMessages]
  }

  /**
   * 清除已发送的消息记录
   */
  clearSentMessages() {
    this.#sentMessages = []
  }

  /**
   * 模拟 maintain 方法
   */
  async open(): Promise<void> {
    this.#isConnected = true
    this.#ev.emit('open')
  }

  /**
   * 模拟发送消息
   */
  send = (messageId: string, data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean => {
    if (!this.#isConnected || this.#shouldFailOnSend) {
      return false
    }

    // 记录发送的消息
    this.#sentMessages.push({ messageId, data })

    // 异步发送 ACK
    setTimeout(() => {
      this.#ev.emit('ack', messageId)
    }, this.#ackDelay)

    return true
  }

  /**
   * 手动触发 ACK（用于测试控制）
   */
  simulateAck(messageId: string) {
    this.#ev.emit('ack', messageId)
  }

  close(): void {
    this.#isConnected = false
    this.#ev.emit('close')
  }

  ping(): void {
    this.#ev.emit('pong')
  }
}

describe('Sender', () => {
  let mockConnection: MockConnectionForSender
  let sender: Sender

  beforeEach(() => {
    mockConnection = new MockConnectionForSender()
  })

  describe('构造函数', () => {
    test('应该能够使用默认配置创建 Sender 实例', () => {
      sender = new Sender(mockConnection)
      expect(sender).toBeInstanceOf(Sender)
    })

    test('应该能够使用自定义配置创建 Sender 实例', () => {
      const options = {
        timeout: 5000,
        maxRetryCount: 5,
      }

      sender = new Sender(mockConnection, options)
      expect(sender).toBeInstanceOf(Sender)
    })
  })

  describe('消息ID生成', () => {
    test('createMessageId 应该生成唯一的字符串ID', () => {
      const id1 = Sender.createMessageId()
      const id2 = Sender.createMessageId()

      expect(id1).toBeTruthy()
      expect(id2).toBeTruthy()
      expect(id1).not.toBe(id2)
      expect(typeof id1).toBe('string')
      expect(typeof id2).toBe('string')
    })

    test('createMessageId 应该生成合理长度的ID', () => {
      const id = Sender.createMessageId()
      // Math.random().toString(36).substring(2, 15) 生成的长度可能在10-13之间
      expect(id.length).toBeGreaterThanOrEqual(10)
      expect(id.length).toBeLessThanOrEqual(13)
    })

    test('应该生成大量唯一的消息ID', () => {
      const ids = new Set()
      const count = 100

      for (let i = 0; i < count; i++) {
        ids.add(Sender.createMessageId())
      }

      expect(ids.size).toBe(count)
    })
  })

  describe('消息发送', () => {
    beforeEach(() => {
      sender = new Sender(mockConnection, {
        timeout: 1000,
        maxRetryCount: 3,
      })
    })

    test('应该能够成功发送字符串消息', async () => {
      const testMessage = 'Hello, WebSocket!'
      mockConnection.clearSentMessages()

      await sender.send(testMessage)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe(testMessage)
      expect(sentMessages[0].messageId).toBeTruthy()
    })

    test('应该能够成功发送 ArrayBuffer 消息', async () => {
      const buffer = new ArrayBuffer(8)
      const view = new Uint8Array(buffer)
      view[0] = 42

      mockConnection.clearSentMessages()

      await sender.send(buffer)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe(buffer)
    })

    test('应该能够成功发送 ArrayBufferView 消息', async () => {
      const buffer = new ArrayBuffer(16)
      const view = new Uint32Array(buffer)
      view[0] = 123456

      mockConnection.clearSentMessages()

      await sender.send(view)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe(view)
    })

    test('发送消息应该等待 ACK 确认', async () => {
      const testMessage = 'Test message'
      mockConnection.setAckDelay(100)
      mockConnection.clearSentMessages()

      const sendPromise = sender.send(testMessage)

      // 在 ACK 延迟期间，检查消息已发送
      await waitForMs(50)
      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)

      // 等待发送完成
      await sendPromise
      expect(sentMessages[0].data).toBe(testMessage)
    })

    test('应该能够并发发送多条消息', async () => {
      const messages = ['Message 1', 'Message 2', 'Message 3']
      mockConnection.clearSentMessages()

      const sendPromises = messages.map(msg => sender.send(msg))
      await Promise.all(sendPromises)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(3)

      const sentData = sentMessages.map(msg => msg.data)
      expect(sentData).toEqual(expect.arrayContaining(messages))
    })
  })

  describe('重试机制', () => {
    beforeEach(() => {
      sender = new Sender(mockConnection, {
        timeout: 200,
        maxRetryCount: 3,
      })
    })

    test('连接失败时应该进行重试', async () => {
      const testMessage = 'Retry test message'

      let sendAttempts = 0
      const originalSend = mockConnection.send
      mockConnection.send = (messageId: string, data: any) => {
        sendAttempts++
        if (sendAttempts <= 2) {
          return false // 前两次失败
        }
        return originalSend.call(mockConnection, messageId, data) // 第三次成功
      }

      mockConnection.clearSentMessages()

      await sender.send(testMessage)

      expect(sendAttempts).toBe(3)
      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe(testMessage)
    })

    test('达到最大重试次数后应该停止', async () => {
      const testMessage = 'Max retry test'
      mockConnection.setShouldFailOnSend(true)
      mockConnection.clearSentMessages()

      // 应该不会抛出异常，但会进行所有重试
      await sender.send(testMessage)

      // 验证没有消息被记录（因为所有发送都失败了）
      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(0)
    })

    test('应该遵循配置的最大重试次数', async () => {
      const customSender = new Sender(mockConnection, {
        timeout: 200,
        maxRetryCount: 2,
      })

      let sendAttempts = 0
      const originalSend = mockConnection.send
      mockConnection.send = () => {
        sendAttempts++
        return false // 总是失败
      }

      await customSender.send('test')

      expect(sendAttempts).toBe(2)

      // 恢复原始方法
      mockConnection.send = originalSend
    })
  })

  describe('超时处理', () => {
    beforeEach(() => {
      sender = new Sender(mockConnection, {
        timeout: 100,
        maxRetryCount: 2,
      })
    })

    test('ACK 超时时应该进行重试', async () => {
      const testMessage = 'Timeout test message'

      // 设置非常长的 ACK 延迟，超过超时时间
      mockConnection.setAckDelay(300)
      mockConnection.clearSentMessages()

      let sendAttempts = 0
      const originalSend = mockConnection.send
      mockConnection.send = (messageId: string, data: any) => {
        sendAttempts++
        if (sendAttempts === 1) {
          // 第一次发送不响应 ACK（模拟超时）
          return true
        }
        // 第二次发送正常响应
        mockConnection.setAckDelay(10)
        return originalSend.call(mockConnection, messageId, data)
      }

      await sender.send(testMessage)

      expect(sendAttempts).toBe(2)
      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
    })

    test('应该能够使用自定义超时时间', async () => {
      const testMessage = 'Custom timeout test'
      const customTimeout = 50

      // 设置 ACK 延迟超过自定义超时时间
      mockConnection.setAckDelay(100)
      mockConnection.clearSentMessages()

      let sendAttempts = 0
      const originalSend = mockConnection.send
      mockConnection.send = (messageId: string, data: any) => {
        sendAttempts++
        if (sendAttempts === 1) {
          return true // 第一次超时
        }
        mockConnection.setAckDelay(10)
        return originalSend.call(mockConnection, messageId, data)
      }

      // 使用自定义超时时间
      await sender.send(testMessage, customTimeout)

      expect(sendAttempts).toBe(2)
    })
  })

  describe('错误处理', () => {
    beforeEach(() => {
      sender = new Sender(mockConnection, {
        timeout: 1000,
        maxRetryCount: 2,
      })
    })

    test('连接断开时发送应该失败但不抛出异常', async () => {
      mockConnection.setConnected(false)

      // 应该不会抛出异常
      await expect(sender.send('test message')).resolves.toBeUndefined()

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(0)
    })

    test('应该能够处理发送过程中的连接断开', async () => {
      let sendAttempts = 0
      const originalSend = mockConnection.send
      mockConnection.send = (messageId: string, data: any) => {
        sendAttempts++
        if (sendAttempts === 1) {
          // 第一次发送失败，模拟连接问题
          return false
        }
        if (sendAttempts === 2) {
          // 第二次发送后断开连接
          setTimeout(() => mockConnection.setConnected(false), 10)
          return originalSend.call(mockConnection, messageId, data)
        }
        // 后续发送应该失败
        return false
      }

      await sender.send('test message')

      // 应该尝试了多次发送
      expect(sendAttempts).toBeGreaterThan(1)
    })
  })

  describe('边界情况', () => {
    test('应该能够处理空字符串消息', async () => {
      sender = new Sender(mockConnection)
      mockConnection.clearSentMessages()

      await sender.send('')

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe('')
    })

    test('应该能够处理零字节的 ArrayBuffer', async () => {
      sender = new Sender(mockConnection)
      const emptyBuffer = new ArrayBuffer(0)

      mockConnection.clearSentMessages()

      await sender.send(emptyBuffer)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe(emptyBuffer)
    })

    test('应该能够处理重复的 ACK 响应', async () => {
      sender = new Sender(mockConnection)
      mockConnection.clearSentMessages()

      const testMessage = 'Duplicate ACK test'

      // 发送消息
      const sendPromise = sender.send(testMessage)

      // 等待一小段时间确保消息已发送
      await waitForMs(50)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)

      const { messageId } = sentMessages[0]

      // 发送多个 ACK 响应
      mockConnection.simulateAck(messageId)
      mockConnection.simulateAck(messageId)
      mockConnection.simulateAck(messageId)

      // 应该正常完成，不会出现异常
      await sendPromise
    })
  })

  describe('性能测试', () => {
    test('应该能够处理大量并发发送', async () => {
      sender = new Sender(mockConnection, {
        timeout: 1000,
        maxRetryCount: 1,
      })

      const messageCount = 50
      const messages = Array.from({ length: messageCount }, (_, i) => `Message ${i}`)

      mockConnection.clearSentMessages()

      // 并发发送大量消息
      const startTime = Date.now()
      await Promise.all(messages.map(msg => sender.send(msg)))
      const endTime = Date.now()

      // 验证所有消息都已发送
      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(messageCount)

      // 简单的性能检查
      expect(endTime - startTime).toBeLessThan(3000)
    })

    test('应该能够处理大消息', async () => {
      sender = new Sender(mockConnection)

      // 创建大字符串（100KB）
      const largeMessage = 'x'.repeat(100 * 1024)

      mockConnection.clearSentMessages()

      await sender.send(largeMessage)

      const sentMessages = mockConnection.getSentMessages()
      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].data).toBe(largeMessage)
    })
  })
})
