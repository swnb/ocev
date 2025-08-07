import { EventProxy, SyncEvent } from '..'

enum Status {
  INIT = 'INIT',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export class WsClient {
  static readonly RECONNECT_INTERVAL = 10 * 1000 // 10s

  static readonly MAX_SERVER_HEARTBEAT_RESPONSE_INTERVAL = 30 * 1000 // 30s

  static readonly HEARTBEAT_INTERVAL = WsClient.MAX_SERVER_HEARTBEAT_RESPONSE_INTERVAL / 2 // 15s

  private url: string

  private ws: WebSocket | null = null

  private status: Status = Status.INIT

  private ev = new SyncEvent<{
    statusChanged: (status: Status) => void
  }>()

  private lastHeartbeatTime = 0

  private isDestoryed = false

  constructor(url: string) {
    this.url = url
    this.setup()

    this.ev.on('statusChanged', status => {
      switch (status) {
        case Status.OPEN:
          this.headrtbeat()
          break
        case Status.CLOSED:
          break
        default:
          break
      }
    })
  }

  static sleep(ms: number) {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    })
  }

  destory() {
    this.isDestoryed = true
    this.ws?.close()
  }

  async headrtbeat() {
    this.lastHeartbeatTime = Date.now()
    // heartbeat 和 aliveCheck 是并行的，如果 aliveCheck 发现服务器已关闭, 就关闭链接
    this.aliveCheck()
    while (!this.isDestoryed) {
      this.ws?.send(JSON.stringify({ type: 'HEARTBEAT' }))
      await WsClient.sleep(WsClient.HEARTBEAT_INTERVAL)
    }
  }

  async aliveCheck() {
    while (!this.isDestoryed) {
      await WsClient.sleep(WsClient.MAX_SERVER_HEARTBEAT_RESPONSE_INTERVAL)
      const now = Date.now()
      if (this.lastHeartbeatTime === 0) {
        this.lastHeartbeatTime = now
      } else if (now - this.lastHeartbeatTime > WsClient.MAX_SERVER_HEARTBEAT_RESPONSE_INTERVAL) {
        // 如果超过最大心跳响应时间，则认为服务器已关闭, 关闭链接
        this.ws?.close()
        break
      } else {
        this.lastHeartbeatTime = now
      }
    }
  }

  // connect to server , throw error if connection closed
  private async connect() {
    this.ws?.close()
    const ws = new WebSocket(this.url)
    const eventProxy = new EventProxy(ws)
    const result = await eventProxy.waitUtilRace(['open', 'close', 'error'])
    if (result.event !== 'open') throw Error('WebSocket connection failed')
    this.ws = ws
    this.updateStatus(Status.OPEN)
    const ev = await eventProxy.waitUtilRace(['close', 'error'])
    if (ev.event === 'close' || ev.event === 'error') {
      this.updateStatus(Status.CLOSED)
    }
  }

  private async setup() {
    while (!this.isDestoryed) {
      try {
        await this.connect()
        // 间隔一段时间后重连
        await WsClient.sleep(WsClient.RECONNECT_INTERVAL)
      } catch (error) {
        console.error('WebSocket connection failed', error)
      }
    }
  }

  private updateStatus(status: Status) {
    this.status = status
    this.ev.emit('statusChanged', this.status)
  }
}
