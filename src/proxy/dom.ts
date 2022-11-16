import { SyncEvent } from 'src/sync-event'
import type { ISyncEvent } from '../types'
import type { GetAddEventListenerKeys, UnionEventHandler } from './common'

export class DomEventProxyAgent<T extends HTMLElement>
  implements
    Omit<
      ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>,
      'publisher' | 'dispatch' | 'createPublisher' | 'observer'
    >
{
  // combination better than extends
  #syncEvent = SyncEvent.new<UnionEventHandler<T, GetAddEventListenerKeys<T>>>()

  #dom: T

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

  get dom() {
    return this.#dom
  }

  // WARN: you should not call construct directly, use static method create or proxy instead
  constructor(dom: T | keyof HTMLElementTagNameMap) {
    if (typeof dom === 'string') {
      const element = document.createElement(dom)

      if (!(element instanceof HTMLElement)) {
        throw Error("don't support element which don't extends HTMLElement ")
      }

      this.#dom = element as any as T
    } else {
      this.#dom = dom
    }

    this.#proxyElement(this.#dom)
  }

  static new<T extends HTMLElement>(dom: T | keyof HTMLElementTagNameMap) {
    return new DomEventProxyAgent(dom)
  }

  static create<T extends keyof HTMLElementTagNameMap>(nodeName: T) {
    return new DomEventProxyAgent<HTMLElementTagNameMap[T]>(nodeName)
  }

  static proxy<T extends HTMLElement>(dom: T) {
    return new DomEventProxyAgent(dom)
  }

  #proxyElement = (dom: T) => {
    const eventKeys: string[] = []

    const findAllEventName = (object: Record<string, any>) => {
      Object.keys(object)
        .filter(key => key.startsWith('on'))
        .filter(key => dom[key] === null || typeof dom[key] === 'function')
        .forEach(key => {
          eventKeys.push(key)
        })
    }

    let extendsObject = Object.getPrototypeOf(dom)
    while (extendsObject) {
      findAllEventName(extendsObject)
      extendsObject = Object.getPrototypeOf(extendsObject)
    }

    eventKeys.forEach(key => {
      const dispatchKey = key.slice(2)
      const pair = [
        dispatchKey,
        (...args: any[]) => {
          ;(this as unknown as SyncEvent<any>).dispatch(dispatchKey as any, ...args)
        },
      ] as const
      dom.addEventListener(pair[0], pair[1])

      this.#removeEvenListenerQueue.push(pair)
    })
  }

  destroy = () => {
    this.offAll()
    this.#removeEvenListenerQueue.forEach(pair => {
      this.#dom.removeEventListener(pair[0], pair[1])
    })
  }
}
