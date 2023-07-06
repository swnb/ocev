import type { UnionEventHandler, GetAddEventListenerKeys } from './types'
import type { ISyncEvent } from '@/types'
import { SyncEvent } from '@/sync-event'

type WindowEventHandler = UnionEventHandler<Window, GetAddEventListenerKeys<Window>>

export class WindowEventProxyAgent
  implements
    Omit<ISyncEvent<WindowEventHandler>, 'publisher' | 'emit' | 'createPublisher' | 'observer'>
{
  // combination better than extends
  #syncEvent = SyncEvent.new<WindowEventHandler>()

  #removeEvenListenerQueue: (readonly [string, (...args: any[]) => void])[] = []

  // rewrite all methods , this is the cost for not use extends

  interceptEmit = this.#syncEvent.interceptEmit

  unInterceptEmit = this.#syncEvent.unInterceptEmit

  on = this.#syncEvent.on

  offAll = this.#syncEvent.offAll

  off = this.#syncEvent.off

  once = this.#syncEvent.once

  any = this.#syncEvent.any

  waitUtil = this.#syncEvent.waitUtil

  createObserver = this.#syncEvent.createObserver

  constructor() {
    this.#proxyWindow()
  }

  static new() {
    return new WindowEventProxyAgent()
  }

  destroy = () => {
    this.offAll()
    this.#removeEvenListenerQueue.forEach(pair => {
      window.removeEventListener(pair[0], pair[1])
    })
  }

  #proxyWindow = () => {
    Object.keys(window)
      .filter(key => key.startsWith('on'))
      // @ts-ignore
      .filter(key => window[key] === null || typeof window[key] === 'function')
      .forEach(key => {
        const emitKey = key.slice(2)
        const pair = [
          emitKey,
          (...args: any[]) => {
            this.#syncEvent.emit(emitKey as any, ...args)
          },
        ] as const
        window.addEventListener(pair[0], pair[1])

        this.#removeEvenListenerQueue.push(pair)
      })
  }
}
