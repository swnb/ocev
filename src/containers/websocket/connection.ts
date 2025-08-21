import type { Subscriber } from '@/types'
import { SyncEvent } from '@/sync-event'

export type ConnectionEvent<Data = string | ArrayBufferLike | Blob | ArrayBufferView> = {
  open: VoidFunction
  close: VoidFunction
  pong: VoidFunction
  ack: (messageId: string) => void
  message: (data: Data) => void
}

export interface IConnection<Data = string | ArrayBufferLike | Blob | ArrayBufferView> {
  open: () => Promise<void>
  send: (messageId: string, data: Data) => boolean
  close: () => void
  ping: () => void
  subscriber: Subscriber<ConnectionEvent<Data>>
}

/**
 * 连接管理器
 * 自己实现了 ping/pong 的机制，这一块需要用户自己实现  IConnection 接口
 */
class WebSocketConnection<Data extends string | ArrayBufferLike | Blob | ArrayBufferView>
  implements IConnection<Data>
{
  #url: string

  #ws: WebSocket | null = null

  #ev = new SyncEvent<ConnectionEvent<Data>>()

  constructor(url: string) {
    this.#url = url
  }

  get subscriber() {
    return this.#ev.subscriber
  }

  open = async (): Promise<void> => {
    this.close()
    this.#createWebSocket()
    const reuslt = await this.#ev.waitUtilRace(['open', 'close'])
    if (reuslt.event === 'close') {
      throw new Error('WebSocket connection closed')
    }
  }

  close = (): void => {
    this.#ws?.close()
    this.#ws = null
  }

  send = (messageId: string, data: Data): boolean => {
    if (!this.#ws) {
      return false
    }
    try {
      this.#ws.send(data)
    } catch {
      return false
    }
    return true
  }

  ping = (): void => {
    this.#ws?.send(
      JSON.stringify({
        type: 'ping',
        payload: {},
      }),
    )
  }

  #createWebSocket = (): WebSocket => {
    this.#ws = new WebSocket(this.#url)
    this.#ws.onopen = () => {
      this.#ev.emit('open')
    }
    this.#ws.onclose = () => {
      this.#ev.emit('close')
    }
    this.#ws.onerror = () => {
      this.#ev.emit('close')
    }
    this.#ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'pong') {
          this.#ev.emit('pong')
        } else {
          this.#ev.emit('message', event.data)
        }
      } catch {
        this.#ev.emit('message', event.data)
      }
    }
    return this.#ws
  }
}

export { WebSocketConnection }
