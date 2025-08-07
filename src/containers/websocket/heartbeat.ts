import type { IConnection } from './connection'
import { StateManager } from './state'

type Options = {
  clientHeartbeatInterval: number
  serverMaxHeartbeatResponseTime: number
  checkHeartbeatInterval: number
}

class HeartbeatManager {
  static defaultOptions: Options = {
    clientHeartbeatInterval: 15 * 1000,
    serverMaxHeartbeatResponseTime: 30 * 1000,
    checkHeartbeatInterval: 15 * 1000,
  }

  #connection: IConnection

  #stateManager: StateManager

  #options: Options

  /**
   * 发送心跳的定时器
   */
  #sendHeartbeatIntervalId: ReturnType<typeof setInterval> | null = null

  /**
   * 检查心跳的定时器
   */
  #checkHeartbeatIntervalId: ReturnType<typeof setInterval> | null = null

  #lastPongTime: number = 0

  constructor(
    connection: IConnection,
    stateManager: StateManager,
    options: Options = HeartbeatManager.defaultOptions,
  ) {
    this.#connection = connection
    this.#stateManager = stateManager
    this.#options = options

    this.#stateManager.subscriber.on('stateChange', (prevState, nextState) => {
      if (nextState === StateManager.State.CONNECTED) {
        this.start()
      } else {
        this.stop()
      }
    })

    this.#connection.subscriber.on('pong', () => {
      this.#lastPongTime = Date.now()
    })
  }

  start = async () => {
    this.#lastPongTime = Date.now()
    this.#sendHeartbeatIntervalId = setInterval(() => {
      this.#sendHeartbeat()
    }, this.#options.clientHeartbeatInterval)
    this.#checkHeartbeatIntervalId = setInterval(() => {
      this.#checkHeartbeat()
    }, this.#options.checkHeartbeatInterval)
  }

  stop = () => {
    if (this.#sendHeartbeatIntervalId) {
      clearInterval(this.#sendHeartbeatIntervalId)
      this.#sendHeartbeatIntervalId = null
    }
    if (this.#checkHeartbeatIntervalId) {
      clearInterval(this.#checkHeartbeatIntervalId)
      this.#checkHeartbeatIntervalId = null
    }
  }

  destroy = () => {
    this.stop()

    this.#stateManager.subscriber.offAll()
  }

  #sendHeartbeat = () => {
    this.#connection.ping()
  }

  #checkHeartbeat = () => {
    if (this.#lastPongTime === 0) {
      return
    }
    const now = Date.now()
    if (now - this.#lastPongTime > this.#options.serverMaxHeartbeatResponseTime) {
      console.error('heartbeat check failed, close connection')
      this.#connection.close()
    }
  }
}

export { HeartbeatManager }
