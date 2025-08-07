import { Channel, type ChannelConfig } from '.'

describe('Channel', () => {
  let channel: Channel<number>

  afterEach(async () => {
    if (channel) {
      await channel.close()
    }
  })

  describe('基本功能测试', () => {
    beforeEach(() => {
      channel = new Channel<number>()
    })

    test('应该能够写入和读取数据', async () => {
      // 写入数据
      const writeResult = await channel.write(1, 2, 3)
      expect(writeResult.success).toBe(true)
      expect(writeResult.size).toBe(3)

      // 等待自动flush
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 50)
      })

      // 读取数据
      const read1 = await channel.read()
      expect(read1.success).toBe(true)
      expect(read1.value).toBe(1)

      const read2 = await channel.read()
      expect(read2.success).toBe(true)
      expect(read2.value).toBe(2)

      const read3 = await channel.read()
      expect(read3.success).toBe(true)
      expect(read3.value).toBe(3)
    })

    test('应该能够获取统计信息', async () => {
      await channel.write(1, 2, 3)

      const stats = channel.getStats()
      expect(stats.totalWrites).toBe(1)
      expect(stats.stashSize).toBe(3)
    })

    test('应该能够获取配置信息', () => {
      const config = channel.getConfig()
      expect(config.flushTimeWindow).toBe(40)
      expect(config.flushSizeThreshold).toBe(10)
      expect(config.enableNagleAlgorithm).toBe(true)
    })
  })

  describe('自定义配置测试', () => {
    test('应该能够使用自定义配置', () => {
      const config: ChannelConfig = {
        flushTimeWindow: 100,
        flushSizeThreshold: 5,
        enableNagleAlgorithm: false,
        congestionThreshold: 0.9,
        minFlushDelay: 10,
      }

      const stringChannel = new Channel<string>(config)
      const retrievedConfig = stringChannel.getConfig()

      expect(retrievedConfig.flushTimeWindow).toBe(100)
      expect(retrievedConfig.flushSizeThreshold).toBe(5)
      expect(retrievedConfig.enableNagleAlgorithm).toBe(false)
      expect(retrievedConfig.congestionThreshold).toBe(0.9)
      expect(retrievedConfig.minFlushDelay).toBe(10)

      // 清理
      return stringChannel.close()
    })
  })

  describe('自动flush机制测试', () => {
    test('应该在达到大小阈值时自动flush', async () => {
      channel = new Channel<number>({
        flushSizeThreshold: 3,
        flushTimeWindow: 1000, // 设置很长的时间窗口
      })

      // 写入3个元素，应该触发自动flush
      await channel.write(1, 2, 3)

      // 等待flush完成
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 20)
      })

      const stats = channel.getStats()
      expect(stats.autoFlushes).toBeGreaterThan(0)
      expect(stats.stashSize).toBe(0)
      expect(stats.mainSize).toBe(3)
    })

    test('应该在时间窗口到期时自动flush', async () => {
      channel = new Channel<number>({
        flushSizeThreshold: 10, // 设置很大的阈值
        flushTimeWindow: 50, // 设置较短的时间窗口
      })

      // 写入少量数据
      await channel.write(1, 2)

      // 等待时间窗口到期
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 80)
      })

      const stats = channel.getStats()
      expect(stats.autoFlushes).toBeGreaterThan(0)
      expect(stats.stashSize).toBe(0)
    })

    test('禁用Nagle算法时应该立即flush', async () => {
      channel = new Channel<number>({
        enableNagleAlgorithm: false,
      })

      await channel.write(1)

      // 立即检查，应该已经flush
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 10)
      })

      const stats = channel.getStats()
      expect(stats.autoFlushes).toBeGreaterThan(0)
      expect(stats.stashSize).toBe(0)
    })
  })

  describe('手动flush测试', () => {
    beforeEach(() => {
      channel = new Channel<number>({
        flushTimeWindow: 10000, // 设置很长的时间窗口，防止自动flush
        flushSizeThreshold: 100,
      })
    })

    test('应该能够手动flush', async () => {
      await channel.write(1, 2, 3)

      // 手动flush
      const flushResult = await channel.flush()
      expect(flushResult.success).toBe(true)
      expect(flushResult.size).toBe(3)

      const stats = channel.getStats()
      expect(stats.manualFlushes).toBe(1)
      expect(stats.stashSize).toBe(0)
      expect(stats.mainSize).toBe(3)
    })

    test('空stash时flush应该成功但不移动数据', async () => {
      const flushResult = await channel.flush()
      expect(flushResult.success).toBe(true)
      expect(flushResult.size).toBe(0)
    })
  })

  describe('拥塞控制测试', () => {
    test('拥塞控制已禁用，应该正常处理所有数据', async () => {
      channel = new Channel<number>({
        congestionThreshold: 0.6, // 虽然设置了阈值，但拥塞检测已禁用
      })

      // 写入数据并flush
      await channel.write(1, 2, 3)
      await channel.flush()

      // 继续写入更多数据
      await channel.write(4, 5, 6, 7, 8)
      await channel.flush()

      const stats = channel.getStats()
      expect(stats.mainSize).toBe(8) // 所有数据都应该正常处理
      expect(stats.congestionDelays).toBe(0) // 没有拥塞延迟
    })
  })

  describe('tryRead测试', () => {
    beforeEach(() => {
      channel = new Channel<number>()
    })

    test('tryRead应该非阻塞地读取数据', async () => {
      // 空队列时应该返回失败
      const emptyResult = channel.tryRead()
      expect(emptyResult.success).toBe(false)

      // 写入数据并flush
      await channel.write(42)
      await channel.flush()

      // 现在应该能读取到数据
      const result = channel.tryRead()
      expect(result.success).toBe(true)
      expect(result.value).toBe(42)

      // 再次读取应该失败
      const emptyResult2 = channel.tryRead()
      expect(emptyResult2.success).toBe(false)
    })
  })

  describe('关闭测试', () => {
    test('关闭后应该无法写入数据', async () => {
      channel = new Channel<number>()

      await channel.close()

      const writeResult = await channel.write(1, 2, 3)
      expect(writeResult.success).toBe(false)
      expect(writeResult.size).toBe(0)
    })

    test('关闭时应该flush剩余数据', async () => {
      channel = new Channel<number>({
        flushTimeWindow: 10000, // 防止自动flush
        flushSizeThreshold: 100,
      })

      await channel.write(1, 2, 3)

      // 关闭前检查stash中有数据
      let stats = channel.getStats()
      expect(stats.stashSize).toBe(3)
      expect(stats.mainSize).toBe(0)

      await channel.close()

      // 关闭后应该已经flush和清理
      // 注意：close操作会清空所有队列，这是正确的清理行为
      stats = channel.getStats()
      expect(stats.stashSize).toBe(0)
      expect(stats.mainSize).toBe(0) // close会清空主队列

      // 但flush统计应该增加，说明数据被处理了
      expect(stats.totalFlushes).toBeGreaterThan(0)
    })
  })

  describe('并发测试', () => {
    test('并发写入应该正确处理', async () => {
      channel = new Channel<number>()

      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(channel.write(i))
      }

      const results = await Promise.all(promises)

      // 所有写入应该成功
      results.forEach(result => {
        expect(result.success).toBe(true)
      })

      const stats = channel.getStats()
      expect(stats.totalWrites).toBe(10)
    })

    test('并发flush应该正确处理', async () => {
      channel = new Channel<number>({
        flushTimeWindow: 10000,
        flushSizeThreshold: 100,
      })

      await channel.write(1, 2, 3)

      // 并发flush
      const flushPromises = [channel.flush(), channel.flush(), channel.flush()]

      const results = await Promise.all(flushPromises)

      // 所有flush应该成功
      results.forEach(result => {
        expect(result.success).toBe(true)
      })

      // 但实际只应该flush一次
      const stats = channel.getStats()
      expect(stats.stashSize).toBe(0)
      expect(stats.mainSize).toBe(3)
    })
  })

  describe('统计信息准确性测试', () => {
    test('应该正确统计各种操作', async () => {
      channel = new Channel<number>({
        flushSizeThreshold: 2,
      })

      // 多次写入
      await channel.write(1)
      await channel.write(2, 3) // 这次应该触发自动flush

      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 20)
      })

      // 手动flush
      await channel.write(4)
      await channel.flush()

      const stats = channel.getStats()
      expect(stats.totalWrites).toBe(3)
      expect(stats.autoFlushes).toBeGreaterThan(0)
      expect(stats.manualFlushes).toBe(1)
      expect(stats.totalFlushes).toBeGreaterThan(1)
      expect(stats.avgFlushDelay).toBeGreaterThanOrEqual(0)
    })
  })
})
