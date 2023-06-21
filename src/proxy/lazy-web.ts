import type { UnionEventHandler, GetAddEventListenerKeys } from './types'
import type { ISyncEvent } from '@/types'
import { InnerHookAbleSyncEvent } from '@/inner-sync-event'

export interface CanAddEventListener {
  addEventListener: (eventName: string, callback: (...args: any[]) => any) => any
  removeEventListener: (eventName: string, callback: (...args: any[]) => any) => any
}

export class LazyWebEventProxyAgent<T extends CanAddEventListener>
  implements
    Omit<
      ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>,
      'publisher' | 'dispatch' | 'createPublisher' | 'observer' | 'any'
    >
{
  // combination better than extends
  #syncEvent = InnerHookAbleSyncEvent.new<UnionEventHandler<T, GetAddEventListenerKeys<T>>>()

  #element: T

  #alreadyRegisterEventList: Map<
    keyof UnionEventHandler<T, GetAddEventListenerKeys<T>>,
    {
      count: number
      callback: VoidFunction
    }
  > = new Map()

  #removeEvenListenerQueue: (readonly [string, (...args: any[]) => void])[] = []

  // rewrite all methods , this is the cost for not use extends

  interceptDispatch = this.#syncEvent.interceptDispatch

  unInterceptDispatch = this.#syncEvent.unInterceptDispatch

  on: ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>['on'] = (type, callback) => {
    if (type === '__offSyncEventListener__' || type === '__onSyncEventListener__') {
      throw Error("you can't not use this eventType")
    }

    return this.#syncEvent.on(type, callback)
  }

  offAll = () => {
    this.#alreadyRegisterEventList.forEach(type => {})
    return this.#syncEvent.offAll()
  }

  off = this.#syncEvent.off

  once = this.#syncEvent.once

  // lazy class can't use any method to listen all event;
  // any = this.#syncEvent.any

  waitUtil = this.#syncEvent.waitUtil

  createObserver = this.#syncEvent.createObserver

  get element() {
    return this.#element
  }

  constructor(element: T) {
    this.#element = element

    // @ts-ignore
    this.#syncEvent.on('__onSyncEventListener__', type => {
      if (!this.#alreadyRegisterEventList.has(type)) {
        const callback = (...args: any[]) => {
          this.#syncEvent.dispatch(type, ...(args as any))
        }
        this.#element.addEventListener(type, callback)
        this.#alreadyRegisterEventList.set(type, {
          count: 1,
          callback,
        })
      } else {
        const registerInfo = this.#alreadyRegisterEventList.get(type)!
        registerInfo.count += 1
      }
    })

    // @ts-ignore
    this.#syncEvent.on('__offSyncEventListener__', type => {
      const registerInfo = this.#alreadyRegisterEventList.get(type)
      if (registerInfo) {
        if (registerInfo.count > 1) {
          registerInfo.count -= 1
        } else {
          this.#alreadyRegisterEventList.delete(type)
          this.#element.removeEventListener(type, registerInfo.callback)
        }
      }
    })
  }

  static new<T extends CanAddEventListener>(element: T) {
    return new LazyWebEventProxyAgent(element)
  }

  destroy = () => {
    this.offAll()
    this.#removeEvenListenerQueue.forEach(pair => {
      this.#element.removeEventListener(pair[0], pair[1])
    })
  }
}
