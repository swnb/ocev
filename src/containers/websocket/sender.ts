import type { IConnection } from './connection'

type Options = {
  timeout: number
  maxRetryCount: number
}

class Sender {
  #connection: IConnection

  #timeout: number

  #maxRetryCount: number

  constructor(connection: IConnection, options: Options = { timeout: 3000, maxRetryCount: 3 }) {
    this.#connection = connection

    this.#timeout = options.timeout

    this.#maxRetryCount = options.maxRetryCount
  }

  static createMessageId = (): string => {
    return Math.random().toString(36).substring(2, 15)
  }

  send = async (
    data: string | ArrayBufferLike | Blob | ArrayBufferView,
    timeout: number = this.#timeout,
  ): Promise<void> => {
    for (let i = 0; i < this.#maxRetryCount; i++) {
      try {
        await this.#send(data, timeout)
        return
      } catch (error) {}
    }
  }

  #send = async (
    data: string | ArrayBufferLike | Blob | ArrayBufferView,
    timeout: number,
  ): Promise<void> => {
    const messageId = Sender.createMessageId()
    const result = this.#connection.send(messageId, data)
    if (!result) {
      throw Error('send message failed')
    }

    await this.#connection.subscriber.waitUtil('ack', {
      where: id => id === messageId,
      timeout,
    })
  }
}

export { Sender }
