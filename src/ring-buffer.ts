import { SyncEvent } from './sync-event'

export class RingBuffer<T> {
  #array: T[]

  #readIndex = 0

  #writeIndex = 0

  #maxWriteIndex

  #capacity

  #syncEvent = SyncEvent.new<{
    read: VoidFunction
    write: VoidFunction
  }>()

  constructor(capacity: number) {
    this.#capacity = capacity
    this.#maxWriteIndex = this.#capacity * 10
    this.#array = new Array(capacity)
  }

  get length() {
    return this.#writeIndex - this.#readIndex
  }

  get isFull() {
    return this.length === this.#capacity
  }

  get isEmpty() {
    return this.length === 0
  }

  read = async (): Promise<T> => {
    while (this.#writeIndex <= this.#readIndex) {
      await this.#syncEvent.waitUtil('write')
    }
    const value = this.#array[this.#readIndex % this.#capacity]
    this.#readIndex += 1
    this.#syncEvent.emit('read')
    return value
  }

  tryRead = (): { ok: false; value: null } | { ok: true; value: T } => {
    if (this.#writeIndex <= this.#readIndex) {
      return { ok: false, value: null }
    }

    const value = this.#array[this.#readIndex % this.#capacity]
    this.#readIndex += 1
    this.#syncEvent.emit('read')
    return { value, ok: true }
  }

  readAll = async (): Promise<T[]> => {
    while (this.#writeIndex <= this.#readIndex) {
      await this.#syncEvent.waitUtil('write')
    }

    const { length } = this

    const result = new Array(length)

    for (let i = 0; i < length; i++) {
      result[i] = this.#array[this.#readIndex % this.#capacity]
      this.#readIndex += 1
    }

    return result
  }

  write = async (value: T) => {
    while (this.length >= this.#capacity) {
      await this.#syncEvent.waitUtil('read')
    }
    this.#array[this.#writeIndex % this.#capacity] = value
    this.#writeIndex += 1
    this.#syncEvent.emit('write')

    // avoid overflow
    if (
      this.#writeIndex > this.#maxWriteIndex &&
      this.#writeIndex % this.#capacity > this.#readIndex % this.#capacity
    ) {
      this.#writeIndex %= this.#capacity
      this.#readIndex %= this.#readIndex % this.#capacity
    }
  }

  tryWrite = (value: T): boolean => {
    if (this.length >= this.#capacity) {
      return false
    }

    this.#array[this.#writeIndex % this.#capacity] = value
    this.#writeIndex += 1
    this.#syncEvent.emit('write')

    // avoid overflow
    if (
      this.#writeIndex > this.#maxWriteIndex &&
      this.#writeIndex % this.#capacity > this.#readIndex % this.#capacity
    ) {
      this.#writeIndex %= this.#capacity
      this.#readIndex %= this.#readIndex % this.#capacity
    }

    return true
  }

  writeAll = async (values: T[]) => {
    for (let i = 0; i < values.length; i++) {
      await this.write(values[i])
    }
  }
}
