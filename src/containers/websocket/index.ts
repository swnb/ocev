import { SyncEvent } from '@/sync-event'
import type { IConnection } from './connection'
import { HeartbeatManager } from './heartbeat'
import { ReconnectManager } from './reconnect'
import { StateManager } from './state'

export type WebSocketClientOptions = {
  reconnectManagerOptions?: {
    baseReconnectInterval: number
  }
  heartbeatManagerOptions?: {
    clientHeartbeatInterval: number
    serverMaxHeartbeatResponseTime: number
    checkHeartbeatInterval: number
  }
}

export type EventHandlerMap = {
  open: VoidFunction
  close: VoidFunction
  message: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void
}

/**
 *
 */
class WebSocketClient {
  #connection: IConnection

  #reconnectManager: ReconnectManager

  #stateManager: StateManager

  #heartbeatManager: HeartbeatManager

  #ev = SyncEvent.new<EventHandlerMap>()

  constructor(connection: IConnection, options: WebSocketClientOptions = {}) {
    this.#stateManager = new StateManager()

    this.#connection = connection

    this.#reconnectManager = new ReconnectManager(
      this.#connection,
      this.#stateManager,
      options.reconnectManagerOptions,
    )

    this.#heartbeatManager = new HeartbeatManager(
      this.#connection,
      this.#stateManager,
      options.heartbeatManagerOptions,
    )
  }

  /**
   * 连接
   */
  connect = async (): Promise<void> => {
    this.#bindEvent()
    await this.#reconnectManager.setup()
  }

  /**
   * 断开连接
   */
  disconnect = async (): Promise<void> => {
    this.#reconnectManager.destroy()
    this.#heartbeatManager.destroy()
    this.#ev.offAll()
  }

  #bindEvent = () => {
    this.#connection.subscriber
      .on('open', () => {
        this.#ev.emit('open')
      })
      .on('close', () => {
        this.#ev.emit('close')
      })
      .on('message', data => {
        this.#ev.emit('message', data)
      })
  }
}

export { WebSocketClient }
