/* eslint-disable @typescript-eslint/member-ordering */
import type { UnionEventHandler, GetAddEventListenerKeys, PrettierListenerKey } from './types'
import type { ISyncEvent, ListenerOptions, SyncEventOptions } from '@/types'
import { InnerHookAbleSyncEvent } from '@/inner-sync-event'

export interface CanAddEventListener {
  addEventListener: (eventName: string, callback: (...args: any[]) => any) => any
  removeEventListener: (eventName: string, callback: (...args: any[]) => any) => any
}

/**
 * Options for configuring the behavior of the EventProxy class.
 */
type Options = {
  proxyAllEvent?: boolean
  addEventListenerOptions?: AddEventListenerOptions | boolean
} & SyncEventOptions

export class EventProxy<T extends CanAddEventListener>
  implements
    Omit<
      ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>,
      'publisher' | 'emit' | 'subscriber' | 'any'
    >
{
  #addEventListenerOptions?: AddEventListenerOptions | boolean

  #syncEvent

  #isAllEventRegister = false

  off

  once

  waitUtil

  waitUtilRace

  waitUtilAll

  waitUtilAny

  createEventReadableStream

  createEventStream

  any

  // subscriber = this.#syncEvent.subscriber

  // publisher = this.#syncEvent.publisher

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

  // #removeEvenListenerQueue: (readonly [string, (...args: any[]) => void])[] = []

  /**
   * Constructs a new instance of EventProxy.
   * @param element The object to proxy events for.
   * @param options Options for configuring the behavior of the EventProxy instance.
   */
  constructor(element: T, options: Options = {}) {
    const { proxyAllEvent = false, addEventListenerOptions, useDateAsTimeTool } = options
    this.#syncEvent = InnerHookAbleSyncEvent.new<UnionEventHandler<T, GetAddEventListenerKeys<T>>>({
      useDateAsTimeTool: !!useDateAsTimeTool,
    })

    this.off = this.#syncEvent.off
    this.once = this.#syncEvent.once
    this.waitUtil = this.#syncEvent.waitUtil
    this.waitUtilRace = this.#syncEvent.waitUtilRace
    this.waitUtilAll = this.#syncEvent.waitUtilAll
    this.waitUtilAny = this.#syncEvent.waitUtilAny
    this.createEventReadableStream = this.#syncEvent.createEventReadableStream
    this.createEventStream = this.#syncEvent.createEventStream
    this.any = this.#syncEvent.any

    this.#addEventListenerOptions = addEventListenerOptions

    this.#element = element

    if (proxyAllEvent) {
      this.proxyAllEvent()
    }

    this.#setupWatcherForBindElementEvent()
  }

  /**
   * Retrieves the element
   */
  get element() {
    return this.#element
  }

  /**
   * Static factory method to create a new EventProxy instance.
   * @param element The object to proxy events for.
   * @param options Options for configuring the behavior of the EventProxy instance.
   * @returns A new instance of EventProxy.
   */
  static new<T extends CanAddEventListener>(element: T, options?: Options) {
    return new EventProxy(element, options)
  }

  /**
   * Adds an event listener to the proxied object.
   * @param type The type of event to listen for.
   * @param callback The callback function to invoke when the event is triggered.
   * @param options Options for configuring the listener.
   * @returns A function to remove the event listener.
   */
  on: ISyncEvent<UnionEventHandler<T, GetAddEventListenerKeys<T>>>['on'] = (
    type,
    callback,
    options?: ListenerOptions,
  ) => {
    if (type === '__offSyncEventListener__' || type === '__onSyncEventListener__') {
      throw Error("you can't not use this eventType")
    }

    return this.#syncEvent.on(type, callback, options)
  }

  /**
   * Gets the number of listeners for a specific event type.
   * @param event Optional. The event type to get the listener count for. If not specified, returns the total listener count.
   * @returns The number of listeners for the specified event type, or the total listener count if no event type is specified.
   */
  listenerCount = (event?: PrettierListenerKey<GetAddEventListenerKeys<T>>) => {
    if (event) {
      return this.#syncEvent.listenerCount(event)
    }
    return this.#syncEvent.listenerCount() - 2
  }

  /**
   * Removes all event listeners for the specified event type, or all event listeners if no event type is specified.
   * @param event Optional. The event type to remove listeners for.
   */
  offAll = <K extends PrettierListenerKey<GetAddEventListenerKeys<T>>>(event?: K) => {
    if (event) {
      const registerInfo = this.#alreadyRegisterEventList.get(event)
      if (registerInfo) {
        this.#alreadyRegisterEventList.delete(event)
        this.#element.removeEventListener(event, registerInfo.callback)
      }
      this.#syncEvent.offAll(event)
    } else {
      this.#alreadyRegisterEventList.forEach(({ callback }, key) => {
        this.#element.removeEventListener(key as string, callback)
      })
      this.#alreadyRegisterEventList.clear()
      this.#syncEvent.offAll()
      this.#setupWatcherForBindElementEvent()
    }
  }

  /**
   * Destroys the EventProxy instance by removing all event listeners.
   */
  destroy = () => {
    this.#alreadyRegisterEventList.forEach(({ callback }, key) => {
      this.#element.removeEventListener(key as string, callback)
    })
    this.#alreadyRegisterEventList.clear()
    this.#syncEvent.offAll()
  }

  /**
   * Proxies all events from the element.
   * @returns The EventProxy instance.
   */
  proxyAllEvent = (): this => {
    if (!this.#isAllEventRegister) {
      this.#proxyElement(this.element)
      this.#isAllEventRegister = true
    }
    return this
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
      this.#checkAndBindElementEvent(emitKey)
    })
  }

  #setupWatcherForBindElementEvent = () => {
    // @ts-ignore
    this.#syncEvent.on('__onSyncEventListener__', type => {
      this.#checkAndBindElementEvent(type)
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

  #checkAndBindElementEvent = (type: any) => {
    if (!this.#alreadyRegisterEventList.has(type)) {
      const callback = (...args: any[]) => {
        this.#syncEvent.emit(type, ...(args as any))
      }
      ;(this.#element.addEventListener as any)?.(type, callback, this.#addEventListenerOptions)
      this.#alreadyRegisterEventList.set(type, {
        count: 1,
        callback,
      })
    } else {
      const registerInfo = this.#alreadyRegisterEventList.get(type)!
      registerInfo.count += 1
    }
  }
}
