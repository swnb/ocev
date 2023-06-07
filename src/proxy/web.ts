import type { UnionEventHandler, GetAddEventListenerKeys } from './common'
import type { ISyncEvent } from '../types'
import { SyncEvent } from '../sync-event'

export interface CanAddEventListener {
  addEventListener: (eventName: string, callback: (...args: any[]) => any) => any
  removeEventListener: (eventName: string, callback: (...args: any[]) => any) => any
}

export class WebEventProxyAgent<T extends CanAddEventListener>
  implements
    Omit<
      ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>,
      'publisher' | 'dispatch' | 'createPublisher' | 'observer'
    >
{
  // combination better than extends
  #syncEvent = SyncEvent.new<UnionEventHandler<T, GetAddEventListenerKeys<T>>>()

  #element: T

  #removeEvenListenerQueue: (readonly [string, (...args: any[]) => void])[] = []

  // rewrite all methods , this is the cost for not use extends

  interceptDispatch = this.#syncEvent.interceptDispatch

  unInterceptDispatch = this.#syncEvent.unInterceptDispatch

  on = this.#syncEvent.on

  offAll = this.#syncEvent.offAll

  off = this.#syncEvent.off

  once = this.#syncEvent.once

  any = this.#syncEvent.any

  waitUtil = this.#syncEvent.waitUtil

  createObserver = this.#syncEvent.createObserver

  get element() {
    return this.#element
  }

  constructor(element: T) {
    this.#element = element

    this.#proxyElement(this.#element)
  }

  static new<T extends CanAddEventListener>(element: T) {
    return new WebEventProxyAgent(element)
  }

  #proxyElement = (element: T) => {
    const eventKeys: string[] = []

    const findAllEventName = (object: Record<string, any>) => {
      Object.keys(object)
        .filter(key => key.startsWith('on'))
        // @ts-ignore
        .filter(key => element[key] === null || typeof element[key] === 'function')
        .forEach(key => {
          eventKeys.push(key)
        })
    }

    let extendsObject = Object.getPrototypeOf(element)
    while (extendsObject) {
      findAllEventName(extendsObject)
      extendsObject = Object.getPrototypeOf(extendsObject)
    }

    eventKeys.forEach(key => {
      const dispatchKey = key.slice(2)
      const pair = [
        dispatchKey,
        (...args: any[]) => {
          this.#syncEvent.dispatch(dispatchKey as any, ...(args as any))
        },
      ] as const

      this.#element.addEventListener(pair[0], pair[1])

      this.#removeEvenListenerQueue.push(pair)
    })
  }

  destroy = () => {
    this.offAll()
    this.#removeEvenListenerQueue.forEach(pair => {
      this.#element.removeEventListener(pair[0], pair[1])
    })
  }
}
