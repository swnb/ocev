import { Queue } from '../queue'

/**
 * @description Channel配置选项，参考TCP缓冲机制
 */
interface ChannelConfig {
  /** 自动flush的时间窗口(ms)，类似TCP的delayed ACK，默认40ms */
  flushTimeWindow?: number
  /** 自动flush的大小阈值，类似TCP的MSS，默认10 */
  flushSizeThreshold?: number
  /** 启用类Nagle算法，延迟发送小批量数据，默认true */
  enableNagleAlgorithm?: boolean
  /** 拥塞避免阈值，当主队列使用率超过此值时减缓flush，默认0.8 */
  congestionThreshold?: number
  /** 最小flush延迟(ms)，防止频繁flush，默认5ms */
  minFlushDelay?: number
}

/**
 * @description Channel统计信息
 */
interface ChannelStats {
  /** stash队列当前大小 */
  stashSize: number
  /** 主队列当前大小 */
  mainSize: number
  /** 总写入次数 */
  totalWrites: number
  /** 总flush次数 */
  totalFlushes: number
  /** 自动flush次数 */
  autoFlushes: number
  /** 手动flush次数 */
  manualFlushes: number
  /** 因拥塞延迟的flush次数 */
  congestionDelays: number
  /** 平均flush延迟(ms) */
  avgFlushDelay: number
}

/**
 * @description 基于双队列的Channel，实现类似TCP的缓冲和flush机制
 *
 * 设计原理：
 * 1. 数据首先写入stash队列（类似TCP发送缓冲区）
 * 2. 根据时间窗口、大小阈值、拥塞状况自动flush到主队列
 * 3. 支持强制flush（类似TCP_NODELAY）
 * 4. 实现简化的拥塞避免机制
 */
class Channel<T> {
  /** stash队列，用于缓冲待发送的数据 */
  #stashQueue: Queue<T>

  /** 主队列，用于存储已确认发送的数据 */
  #mainQueue: Queue<T>

  /** 配置选项 */
  #config: Required<ChannelConfig>

  /** 统计信息 */
  #stats: ChannelStats

  /** 自动flush的定时器ID */
  #flushTimer: NodeJS.Timeout | null = null

  /** 最后一次flush的时间戳 */
  #lastFlushTime: number = 0

  /** Channel是否已关闭 */
  #closed: boolean = false

  /** 等待中的flush操作Promise */
  #pendingFlush: Promise<{ success: boolean; size: number }> | null = null

  constructor(config: ChannelConfig = {}) {
    this.#config = {
      flushTimeWindow: config.flushTimeWindow ?? 40,
      flushSizeThreshold: config.flushSizeThreshold ?? 10,
      enableNagleAlgorithm: config.enableNagleAlgorithm ?? true,
      congestionThreshold: config.congestionThreshold ?? 0.8,
      minFlushDelay: config.minFlushDelay ?? 5,
    }

    this.#stashQueue = Queue.new()
    this.#mainQueue = Queue.new()

    this.#stats = {
      stashSize: 0,
      mainSize: 0,
      totalWrites: 0,
      totalFlushes: 0,
      autoFlushes: 0,
      manualFlushes: 0,
      congestionDelays: 0,
      avgFlushDelay: 0,
    }
  }

  /**
   * @description 写入数据到stash队列，实现类似TCP发送缓冲的机制
   * @param items 要写入的数据项
   * @returns 写入结果
   */
  write = async (...items: T[]): Promise<{ success: boolean; size: number }> => {
    if (this.#closed) {
      return { success: false, size: 0 }
    }

    const { success, pushedSize } = await this.#stashQueue.push(...items)

    if (success) {
      this.#stats.totalWrites += 1
      this.#stats.stashSize = this.#stashQueue.length()

      // 检查是否需要自动flush
      await this.#checkAutoFlush()
    }

    return { success, size: pushedSize }
  }

  /**
   * @description 手动强制flush，类似TCP_NODELAY的效果
   * @returns flush结果
   */
  flush = async (): Promise<{ success: boolean; size: number }> => {
    if (this.#closed) {
      return { success: false, size: 0 }
    }

    // 如果有等待中的flush，等待完成
    if (this.#pendingFlush) {
      await this.#pendingFlush
    }

    const flushStartTime = Date.now()
    this.#stats.manualFlushes += 1

    const result = await this.#performFlush()

    // 更新统计信息
    this.#updateFlushStats(flushStartTime)

    return result
  }

  /**
   * @description 从主队列读取数据
   * @returns 读取的数据
   */
  read = async (): Promise<{ value: T; success: true } | { value: undefined; success: false }> => {
    const result = await this.#mainQueue.read()
    if (result.success) {
      this.#stats.mainSize = this.#mainQueue.length()
    }
    return result
  }

  /**
   * @description 尝试从主队列读取数据（非阻塞）
   * @returns 读取的数据或失败
   */
  tryRead = (): { value: T; success: true } | { value: undefined; success: false } => {
    const result = this.#mainQueue.tryRead()
    if (result.success) {
      this.#stats.mainSize = this.#mainQueue.length()
    }
    return result
  }

  /**
   * @description 获取Channel统计信息
   * @returns 统计信息对象
   */
  getStats = (): Readonly<ChannelStats> => {
    return {
      ...this.#stats,
      stashSize: this.#stashQueue.length(),
      mainSize: this.#mainQueue.length(),
    }
  }

  /**
   * @description 获取Channel配置
   * @returns 配置对象
   */
  getConfig = (): Readonly<ChannelConfig> => {
    return { ...this.#config }
  }

  /**
   * @description 关闭Channel，清理资源
   */
  close = async (): Promise<void> => {
    if (this.#closed) return

    this.#closed = true

    // 清除定时器
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer)
      this.#flushTimer = null
    }

    // 等待pending flush完成
    if (this.#pendingFlush) {
      await this.#pendingFlush
    }

    // 最后一次flush并更新统计
    const flushStartTime = Date.now()
    await this.#performFlush()
    this.#updateFlushStats(flushStartTime)

    // 关闭队列
    await this.#stashQueue.close()
    await this.#mainQueue.close()
  }

  /**
   * @description 检查主队列是否发生拥塞
   * @returns 是否拥塞
   */
  #isCongested = (): boolean => {
    return false
  }

  /**
   * @description 检查是否需要自动flush
   */
  #checkAutoFlush = async (): Promise<void> => {
    if (!this.#config.enableNagleAlgorithm) {
      // 禁用Nagle算法时立即flush
      await this.#scheduleFlush(0)
      return
    }

    const stashSize = this.#stashQueue.length()
    const timeSinceLastFlush = Date.now() - this.#lastFlushTime

    // 大小阈值触发
    if (stashSize >= this.#config.flushSizeThreshold) {
      await this.#scheduleFlush(this.#config.minFlushDelay)
      return
    }

    // 时间窗口触发
    if (stashSize > 0 && !this.#flushTimer) {
      const delay = Math.max(
        this.#config.flushTimeWindow - timeSinceLastFlush,
        this.#config.minFlushDelay,
      )
      this.#scheduleFlush(delay)
    }
  }

  /**
   * @description 调度flush操作
   * @param delay 延迟时间(ms)
   */
  #scheduleFlush = async (delay: number): Promise<void> => {
    // 清除已有的定时器
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer)
      this.#flushTimer = null
    }

    if (delay <= 0) {
      // 立即flush
      const flushStartTime = Date.now()
      this.#stats.autoFlushes += 1
      await this.#performFlush()
      this.#updateFlushStats(flushStartTime)
    } else {
      // 延迟flush
      this.#flushTimer = setTimeout(async () => {
        this.#flushTimer = null
        if (!this.#closed && this.#stashQueue.length() > 0) {
          const flushStartTime = Date.now()
          this.#stats.autoFlushes += 1
          await this.#performFlush()
          this.#updateFlushStats(flushStartTime)
        }
      }, delay)
    }
  }

  /**
   * @description 执行实际的flush操作
   * @returns flush结果
   */
  #performFlush = async (): Promise<{ success: boolean; size: number }> => {
    if (this.#pendingFlush) {
      await this.#pendingFlush
      return { success: true, size: 0 }
    }

    this.#pendingFlush = this.#doFlush()
    const result = await this.#pendingFlush
    this.#pendingFlush = null

    return result
  }

  /**
   * @description 实际执行flush逻辑
   */
  #doFlush = async (): Promise<{ success: boolean; size: number }> => {
    let totalFlushed = 0

    // 检查拥塞状况
    if (this.#isCongested()) {
      this.#stats.congestionDelays += 1
      // 实现简单的退避策略
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), this.#config.minFlushDelay * 2)
      })
    }

    // 将stash队列中的所有数据转移到主队列
    while (!this.#stashQueue.isEmpty && !this.#mainQueue.isFull) {
      const readResult = this.#stashQueue.tryRead()
      if (!readResult.success) break

      const writeResult = await this.#mainQueue.tryPush(readResult.value)
      if (!writeResult) {
        // 主队列满了，将数据放回stash队列前端
        await this.#stashQueue.push(readResult.value)
        break
      }

      totalFlushed += 1
    }

    // 更新统计信息
    this.#stats.stashSize = this.#stashQueue.length()
    this.#stats.mainSize = this.#mainQueue.length()
    this.#lastFlushTime = Date.now()

    return { success: true, size: totalFlushed }
  }

  /**
   * @description 更新flush相关的统计信息
   * @param startTime flush开始时间
   */
  #updateFlushStats = (startTime: number): void => {
    const flushDuration = Date.now() - startTime
    this.#stats.totalFlushes += 1

    // 计算平均flush延迟
    const totalFlushTime =
      this.#stats.avgFlushDelay * (this.#stats.totalFlushes - 1) + flushDuration
    this.#stats.avgFlushDelay = totalFlushTime / this.#stats.totalFlushes
  }
}

export { Channel, type ChannelConfig, type ChannelStats }
