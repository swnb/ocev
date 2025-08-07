import type { Subscriber } from '@/types'
import { SyncEvent } from '@/sync-event'

export type ConnectionEvent = {
  open: VoidFunction
  close: VoidFunction
  pong: VoidFunction
  message: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void
}

export interface IConnection {
  close: () => void
  open: () => Promise<void>
  ping: () => void
  subscriber: Subscriber<ConnectionEvent>
}

/**
 * 连接管理器
 * 自己实现了 ping/pong 的机制，这一块需要用户自己实现  IConnection 接口
 */
class WebSocketConnection implements IConnection {
  #url: string

  #ws: WebSocket | null = null

  #ev = new SyncEvent<ConnectionEvent>()

  constructor(url: string) {
    this.#url = url
  }

  get subscriber() {
    return this.#ev.subscriber
  }

  open = async (): Promise<void> => {
    this.close()
    this.#createWebSocket()
    await this.#ev.waitUtil('open')
  }

  close = (): void => {
    this.#ws?.close()
    this.#ws = null
  }

  send = (data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean => {
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
