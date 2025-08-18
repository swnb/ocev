import { SyncEvent } from '@/sync-event'
import type { IConnection } from './connection'
import { HeartbeatManager } from './heartbeat'
import { ReconnectManager } from './reconnect'
import { StateManager } from './state'
import { Sender } from './sender'

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

export type EventHandlerMap<Data> = {
  open: VoidFunction
  close: VoidFunction
  message: (data: Data) => void
}

/**
 *
 */
class WebSocketClient<Data = string | ArrayBufferLike | Blob | ArrayBufferView> {
  #connection: IConnection<Data>

  #reconnectManager: ReconnectManager<Data>

  #stateManager: StateManager

  #heartbeatManager: HeartbeatManager<Data>

  #sender: Sender<Data>

  #ev = SyncEvent.new<EventHandlerMap<Data>>()

  constructor(connection: IConnection<Data>, options: WebSocketClientOptions = {}) {
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

    this.#sender = new Sender(this.#connection)
  }

  /**
   * 获取事件订阅器，用于监听WebSocket事件
   */
  get subscriber() {
    return this.#ev.subscriber
  }

  send = async (data: Data) => {
    await this.#sender.send(data)
  }

  /**
   * 连接
   */
  maintain = async (): Promise<void> => {
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
