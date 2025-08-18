import type { IConnection } from './connection'

/**
 * Sender 配置选项
 */
type Options = {
  /** 超时时间（毫秒） */
  timeout: number
  /** 最大重试次数 */
  maxRetryCount: number
}

/**
 * WebSocket 消息发送器
 *
 * 提供可靠的消息发送功能，支持自动重试和超时处理
 */
class Sender<Data = string | ArrayBufferLike | Blob | ArrayBufferView> {
  /** WebSocket 连接实例 */
  #connection: IConnection<Data>

  /** 默认超时时间 */
  #timeout: number

  /** 最大重试次数 */
  #maxRetryCount: number

  /**
   * 创建 Sender 实例
   *
   * @param connection WebSocket 连接实例
   * @param options 配置选项，包含超时时间和重试次数
   */
  constructor(
    connection: IConnection<Data>,
    options: Options = { timeout: 3000, maxRetryCount: 3 },
  ) {
    this.#connection = connection

    this.#timeout = options.timeout

    this.#maxRetryCount = options.maxRetryCount
  }

  /**
   * 生成唯一的消息ID
   *
   * @returns 13位随机字符串
   */
  static createMessageId = (): string => {
    return Math.random().toString(36).substring(2, 15)
  }

  /**
   * 发送消息
   *
   * 自动重试指定次数，直到成功或达到重试上限
   *
   * @param data 要发送的数据
   * @param timeout 超时时间（可选，默认使用实例配置）
   */
  send = async (data: Data, timeout: number = this.#timeout): Promise<void> => {
    // 重试循环
    for (let i = 0; i < this.#maxRetryCount; i++) {
      try {
        await this.#send(data, timeout)
        return
      } catch (error) {
        // 忽略错误，继续重试
      }
    }
  }

  /**
   * 内部发送方法
   *
   * 执行单次发送尝试，包含消息ID生成、发送和等待ACK确认
   *
   * @param data 要发送的数据
   * @param timeout 超时时间
   */
  #send = async (data: Data, timeout: number): Promise<void> => {
    // 生成唯一消息ID
    const messageId = Sender.createMessageId()

    // 通过连接发送消息
    const result = this.#connection.send(messageId, data)
    if (!result) {
      throw Error('send message failed')
    }

    // 等待ACK确认
    await this.#connection.subscriber.waitUtil('ack', {
      where: id => id === messageId,
      timeout,
    })
  }
}

export { Sender }
