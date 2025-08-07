import type { IConnection } from './connection'
import { HeartbeatManager } from './heartbeat'
import { ReconnectManager } from './reconnect'
import { StateManager } from './state'

type Options = {
  reconnectManagerOptions?: {
    baseReconnectInterval: number
  }
  heartbeatManagerOptions?: {
    clientHeartbeatInterval: number
    serverMaxHeartbeatResponseTime: number
    checkHeartbeatInterval: number
  }
}

class WebSocketClient {
  #connection: IConnection

  #reconnectManager: ReconnectManager

  #stateManager: StateManager

  #heartbeatManager: HeartbeatManager

  constructor(connection: IConnection, options: Options = {}) {
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
    await this.#reconnectManager.setup()
  }

  /**
   * 断开连接
   */
  disconnect = async (): Promise<void> => {
    this.#reconnectManager.destroy()
    this.#heartbeatManager.destroy()
  }
}

export { WebSocketClient }
