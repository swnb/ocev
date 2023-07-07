import type { UnionEventHandler, GetAddEventListenerKeys } from './types'
import type { ISyncEvent } from '@/types'
import { InnerHookAbleSyncEvent } from '@/inner-sync-event'

export interface CanAddEventListener {
  addEventListener: (eventName: string, callback: (...args: any[]) => any) => any
  removeEventListener: (eventName: string, callback: (...args: any[]) => any) => any
}

type Options = {
  proxyAllEvent?: boolean
}

export class EventProxy<T extends CanAddEventListener>
  implements
    Omit<
      ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>,
      'publisher' | 'emit' | 'createPublisher' | 'observer' | 'any'
    >
{
  #syncEvent = InnerHookAbleSyncEvent.new<UnionEventHandler<T, GetAddEventListenerKeys<T>>>()

  #proxyAllEvent = false

  interceptEmit = this.#syncEvent.interceptEmit

  unInterceptEmit = this.#syncEvent.unInterceptEmit

  off = this.#syncEvent.off

  once = this.#syncEvent.once

  waitUtil = this.#syncEvent.waitUtil

  waitUtilRace = this.#syncEvent.waitUtilRace

  waitUtilAll = this.#syncEvent.waitUtilAll

  waitUtilAny = this.#syncEvent.waitUtilAny

  createObserver = this.#syncEvent.createObserver

  any = this.#syncEvent.any

  // rewrite all methods , this is the cost for not use extends

  // combination better than extends

  #element: T

  #alreadyRegisterEventList: Map<
    keyof UnionEventHandler<T, GetAddEventListenerKeys<T>>,
    {
      count: number
      callback: VoidFunction
    }
  > = new Map()

  #removeEvenListenerQueue: (readonly [string, (...args: any[]) => void])[] = []

  constructor(element: T, options: Options = {}) {
    const { proxyAllEvent = false } = options

    this.#element = element

    this.#proxyAllEvent = proxyAllEvent

    if (proxyAllEvent) {
      this.#proxyElement(element)
      return
    }

    // @ts-ignore
    this.#syncEvent.on('__onSyncEventListener__', type => {
      if (!this.#alreadyRegisterEventList.has(type)) {
        const callback = (...args: any[]) => {
          this.#syncEvent.emit(type, ...(args as any))
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

  get element() {
    return this.#element
  }

  get listenerCount() {
    return this.#syncEvent.listenerCount
  }

  static new<T extends CanAddEventListener>(element: T, options?: Options) {
    return new EventProxy(element, options)
  }

  on: ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>['on'] = (type, callback) => {
    if (type === '__offSyncEventListener__' || type === '__onSyncEventListener__') {
      throw Error("you can't not use this eventType")
    }

    return this.#syncEvent.on(type, callback)
  }

  offAll = () => {
    this.#alreadyRegisterEventList.forEach(({ callback }, key) => {
      this.#element.removeEventListener(key, callback)
    })
    return this.#syncEvent.offAll()
  }

  destroy = () => {
    this.offAll()
    this.#removeEvenListenerQueue.forEach(pair => {
      this.#element.removeEventListener(pair[0], pair[1])
    })
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

    let currentObject = element
    while (currentObject) {
      findAllEventName(currentObject)
      currentObject = Object.getPrototypeOf(currentObject)
    }

    eventKeys.forEach(key => {
      const emitKey = key.slice(2)
      const pair = [
        emitKey,
        (...args: any[]) => {
          this.#syncEvent.emit(emitKey as any, ...(args as any))
        },
      ] as const

      this.#element.addEventListener(pair[0], pair[1])

      this.#removeEvenListenerQueue.push(pair)
    })
  }
}
