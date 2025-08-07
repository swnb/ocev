import { waitForMs } from '@/helpers/time'
import type { IConnection } from './connection'
import { StateManager } from './state'

type Options = {
  baseReconnectInterval: number
}

class ReconnectManager {
  static defaultOptions: Options = {
    baseReconnectInterval: 1000,
  }

  #connection: IConnection

  #stateManager: StateManager

  #isDestoryed = false

  #baseReconnectInterval: number

  #retryCount = 0

  constructor(
    connection: IConnection,
    stateManager: StateManager,
    options: Options = ReconnectManager.defaultOptions,
  ) {
    this.#connection = connection
    this.#stateManager = stateManager
    this.#baseReconnectInterval = options.baseReconnectInterval
  }

  /**
   * 启动重连守护机制
   */
  setup = async () => {
    this.#retryCount = 0
    while (!this.#isDestoryed) {
      this.#stateManager.updateState(StateManager.State.CONNECTING)
      await this.#connection.open()
      this.#stateManager.updateState(StateManager.State.CONNECTED)
      await this.#connection.subscriber.waitUtilRace(['close'])
      this.#stateManager.updateState(StateManager.State.DISCONNECTED)
      await waitForMs(this.#getReconnectionWaitTime())
      this.#retryCount += 1
    }
  }

  /**
   * 销毁重连守护机制
   */
  destroy = () => {
    this.#isDestoryed = true
    this.#connection.close()
  }

  /**
   * 获取重连等待时间
   */
  #getReconnectionWaitTime = (): number => {
    const jitter = Math.random() * 50000 // 0-5s;
    const base = Math.min(this.#baseReconnectInterval * 2 ** this.#retryCount, 30000)
    return base + jitter
  }
}

export { ReconnectManager }
