/* eslint-disable @typescript-eslint/member-ordering */
import type { ISyncEvent } from '../types'
import type { GetAddEventListenerKeys, UnionEventHandler } from './common'
import { WebEventProxyAgent } from './web'

export class DomEventProxyAgent<T extends HTMLElement>
  implements
    Omit<
      ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>,
      'publisher' | 'dispatch' | 'createPublisher' | 'observer'
    >
{
  #webEventProxyAgent: WebEventProxyAgent<T>

  interceptDispatch: WebEventProxyAgent<T>['interceptDispatch']

  unInterceptDispatch: WebEventProxyAgent<T>['unInterceptDispatch']

  on: WebEventProxyAgent<T>['on']

  once: WebEventProxyAgent<T>['once']

  any: WebEventProxyAgent<T>['any']

  offAll: WebEventProxyAgent<T>['offAll']

  off: WebEventProxyAgent<T>['off']

  waitUtil: WebEventProxyAgent<T>['waitUtil']

  createObserver: WebEventProxyAgent<T>['createObserver']

  // WARN: you should not call construct directly, use static method create or proxy instead
  constructor(domOrTagName: T | keyof HTMLElementTagNameMap) {
    if (typeof domOrTagName === 'string') {
      const element = document.createElement(domOrTagName) as T

      if (!(element instanceof HTMLElement)) {
        throw Error("don't support element which don't extends HTMLElement ")
      }

      this.#webEventProxyAgent = WebEventProxyAgent.new(element)
    } else {
      this.#webEventProxyAgent = WebEventProxyAgent.new(domOrTagName as T)
    }

    this.interceptDispatch = this.#webEventProxyAgent.interceptDispatch

    this.unInterceptDispatch = this.#webEventProxyAgent.unInterceptDispatch

    this.on = this.#webEventProxyAgent.on

    this.once = this.#webEventProxyAgent.once

    this.any = this.#webEventProxyAgent.any

    this.offAll = this.#webEventProxyAgent.offAll

    this.off = this.#webEventProxyAgent.off

    this.waitUtil = this.#webEventProxyAgent.waitUtil

    this.createObserver = this.#webEventProxyAgent.createObserver
  }

  static createElement<T extends keyof HTMLElementTagNameMap>(nodeName: T) {
    return new DomEventProxyAgent<HTMLElementTagNameMap[T]>(nodeName)
  }

  static proxyElement<T extends HTMLElement>(element: T) {
    return new DomEventProxyAgent<T>(element)
  }
}
