import { SyncEvent } from '../sync-event'

class Queue<T> {
  #bufferSize: number = 0

  #ev = new SyncEvent<{
    consumed: () => void
    pushed: () => void
    closed: () => void
    reset: () => void
  }>()

  #queue: T[] = []

  #closed: boolean = false

  constructor(bufferSize: number) {
    this.#bufferSize = bufferSize
  }

  /**
   * @description 判断队列是否已满
   * @returns {boolean} 队列是否已满
   */
  get isFull(): boolean {
    return this.#bufferSize > 0 && this.#queue.length >= this.#bufferSize
  }

  /**
   * @description 判断队列是否为空
   * @returns {boolean} 队列是否为空
   */
  get isEmpty(): boolean {
    return this.#queue.length === 0
  }

  /**
   * @description 判断队列是否已关闭
   * @readonly
   * @type {boolean}
   */
  get isClosed(): boolean {
    return this.#closed
  }

  /**
   * @description 创建队列
   * @param {number} bufferSize - 队列的容量
   * @returns {Queue<T>} 队列
   */
  static new<T>(bufferSize: number = 0): Queue<T> {
    return new Queue(bufferSize)
  }

  /**
   * @description 获取队列的容量
   * @returns {number} 队列的容量
   */
  remainingCapacity = (): number => {
    if (this.#bufferSize === 0) {
      return Infinity
    }

    return this.#bufferSize - this.#queue.length
  }

  /**
   * @description 获取队列的容量
   * @returns {number} 队列的容量
   */
  capacity = (): number => {
    if (this.#bufferSize === 0) {
      return Infinity
    }

    return this.#bufferSize
  }

  /**
   * @description 获取队列的长度
   * @returns {number} 队列的长度
   */
  length = (): number => {
    return this.#queue.length
  }

  /**
   * @description 将元素推入队列
   * @param {T[]} items - 要推入队列的元素
   * @returns {Promise<{ success: boolean }>} 是否成功推入队列, 如果 close 则返回 false
   */
  push = async (...items: T[]): Promise<{ success: boolean }> => {
    if (this.#closed) {
      return { success: false }
    }

    for (let i = 0; i < items.length; i++) {
      while (this.isFull) {
        const result = await this.#ev.waitUtilRace(['consumed', 'closed', 'reset'])
        if (result.event === 'closed' || result.event === 'reset') {
          return { success: false }
        }
      }

      if (this.#closed) {
        return { success: false }
      }

      this.#queue.push(items[i])
      this.#ev.emit('pushed')
    }

    return { success: true }
  }

  /**
   * @description 尝试将元素推入队列
   * @param {T[]} args - 要推入队列的元素
   * @returns {boolean} 是否成功推入队列
   */
  tryPush = async (...args: T[]): Promise<boolean> => {
    if (this.#closed || this.isFull) {
      return false
    }

    this.#queue.push(...args)
    this.#ev.emit('pushed')
    return true
  }

  /**
   * @description 尝试从队列中读取元素
   * @returns {Promise<T>} 读取的元素
   */
  tryRead = (): { value: T; success: true } | { value: undefined; success: false } => {
    if (this.#closed || this.isEmpty) {
      return { value: undefined, success: false }
    }

    const value = this.#queue.shift()!
    this.#ev.emit('consumed')
    return { value, success: true }
  }

  /**
   * @description 从队列中读取元素
   * @returns {Promise<{ value: T; success: true } | { value: undefined; success: false }>} 读取的元素, 如果 close 则 success 为 false, 否则 success 为 true
   */
  read = async (): Promise<{ value: T; success: true } | { value: undefined; success: false }> => {
    if (this.#closed) {
      return { value: undefined, success: false }
    }

    while (this.isEmpty) {
      const result = await this.#ev.waitUtilRace(['pushed', 'closed', 'reset'])
      if (result.event === 'closed' || result.event === 'reset') {
        return { value: undefined, success: false }
      }
    }

    if (this.#closed) {
      return { value: undefined, success: false }
    }

    const value = this.#queue.shift()!
    this.#ev.emit('consumed')
    return { value, success: true }
  }

  /**
   * @description 关闭队列
   */
  close = async (): Promise<void> => {
    this.#closed = true
    this.#ev.emit('closed')
    this.#ev.offAll()
    this.#queue = []
  }

  /**
   * @description 重置队列到初始状态，清空内容并重新开始
   * 注意：正在等待的操作会返回失败，需要重新开始
   */
  reset = async (): Promise<void> => {
    this.#closed = false
    this.#queue = []
    this.#ev.emit('reset')
  }
}

export { Queue }
