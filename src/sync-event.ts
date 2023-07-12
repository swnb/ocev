import type {
  HandlerMap,
  ISyncEvent,
  Arguments,
  ObserverAccessControl,
  IAccessControlObserver,
  PublisherAccessControl,
  IAccessControlPublisher,
  LinkableListener,
  WaitUtilConfig,
  EventListItem,
} from './types'
import { errors } from './index'
import { CollectionMap } from './map'
import { createListenerLinker } from './linkable-listener'

export class SyncEvent<M extends HandlerMap> implements ISyncEvent<M> {
  #handlerMap = new CollectionMap<{
    [K in keyof M]: Set<M[K]>
  }>()

  #isInterceptEmit = false

  #onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M] & { type: keyof M }>()

  #anyHandlerSet = new Set<(...args: any[]) => any>()

  #observer: Pick<this, 'on' | 'once' | 'off' | 'waitUtil'>

  #publisher: Pick<this, 'emit' | 'interceptEmit' | 'unInterceptEmit'>

  #listenerCount = 0

  constructor() {
    this.#observer = Object.freeze({
      on: this.on,
      once: this.once,
      off: this.off,
      waitUtil: this.waitUtil,
    })
    this.#publisher = Object.freeze({
      emit: this.emit,
      interceptEmit: this.interceptEmit,
      unInterceptEmit: this.unInterceptEmit,
    })
  }

  /**
   * observer only allow to call method : 'on' | 'once' | 'sequenceOn' | 'cancel' | 'waitUtil'
   */
  get observer() {
    return this.#observer
  }

  /**
   * publisher only allow to call method : 'emit' | 'interceptEmit' | 'unInterceptEmit'
   */
  get publisher() {
    return this.#publisher
  }

  /**
   * get listener count
   *
   * @public
   * @readonly
   * @type {number}
   */
  public get listenerCount() {
    return this.#listenerCount
  }

  // factory pattern
  static new<M extends HandlerMap>() {
    return new SyncEvent<M>()
  }

  /**
   * interceptEmit will stop all emit
   * util unInterceptEmit is called
   */
  public interceptEmit = () => {
    this.#isInterceptEmit = true
  }

  /**
   * interceptEmit will resume all emit
   * nothing will happen if interceptEmit is not called
   */
  public unInterceptEmit = () => {
    this.#isInterceptEmit = true
  }

  /**
   *
   * @param event  event name , same as emit event name
   * @param handler  callback will run when emit same event name
   * @return {VoidFunction} function off handler
   */
  public on = <K extends keyof M>(event: K, handler: M[K]): LinkableListener<M> => {
    const handlersSet = this.#handlerMap.get(event)
    if (handlersSet) {
      handlersSet.add(handler)
    } else {
      const newHandlersSet = new Set<M[K]>()
      newHandlersSet.add(handler)
      this.#handlerMap.set(event, newHandlersSet)
    }

    this.#listenerCount += 1

    const cancelFunction = this.off.bind(null, event, handler)

    return createListenerLinker(this.on, this.once, [cancelFunction])
  }

  /**
   * @param handler  any emit will emit handler
   * @returns
   */
  public any = <K extends keyof M = keyof M>(
    handler: (event: K, ...args: Arguments<M[K]>) => void,
  ) => {
    if (!this.#anyHandlerSet.has(handler)) {
      this.#anyHandlerSet.add(handler)
      this.#listenerCount += 1
    }

    return () => {
      if (this.#anyHandlerSet.delete(handler)) {
        this.#listenerCount -= 1
      }
    }
  }

  /**
   * @param event event name
   * @param handler  callback only run one time
   * @returns
   */
  public once = <K extends keyof M>(event: K, handler: M[K]): LinkableListener<M> => {
    const handlerWrapper = (...arg: Arguments<M[K]>) => {
      // @ts-ignore
      this.off(event, handler)
      // @ts-ignore
      handler(...arg)
    }
    handlerWrapper.type = event
    // @ts-ignore
    this.on(event, handlerWrapper)
    // @ts-ignore
    this.#onceHandlerWrapperMap.set(handler, handlerWrapper)

    const cancelFunction = this.off.bind(null, event, handler)

    return createListenerLinker(this.on, this.once, [cancelFunction])
  }

  /**
   * unregister all callback
   * @param event event name
   * @returns {this}
   */
  public offAll = <K extends keyof M>(event?: K): this => {
    if (event) {
      // FIXME memory leak
      this.#handlerMap.set(event, new Set())
    } else {
      this.#handlerMap.clear()
      this.#onceHandlerWrapperMap.clear()
      this.#anyHandlerSet.clear()
    }

    this.#listenerCount = 0

    return this
  }

  public off = <K extends keyof M>(event: K, handler: M[K]) => {
    const handlers = this.#handlerMap.get(event)
    if (handlers) {
      const successDeleted = handlers.delete(handler)
      if (successDeleted) {
        this.#listenerCount -= 1
      }
    }

    const handlerWrapper = this.#onceHandlerWrapperMap.get(handler)
    if (handlerWrapper) {
      this.#onceHandlerWrapperMap.delete(handler)
      this.off(handlerWrapper.type, handlerWrapper)
    }

    return this
  }

  // emit event and some arguments
  // all register will call with the arguments
  public emit = <K extends keyof M>(event: K, ...arg: Parameters<M[K]>) => {
    // 一段时间内不可以监听事件
    if (this.#isInterceptEmit) return this

    const handlers = this.#handlerMap.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          // @ts-ignore
          handler(...arg)
        } catch {}
      })
    }

    this.#anyHandlerSet.forEach(handler => {
      try {
        // @ts-ignore
        handler(event, ...arg)
      } catch {}
    })

    return this
  }

  /**
   * waitUil return promise which will resolve util the event name is emit
   * cancelRef will set current property cancel function
   * cancelRef is design to avid memory leak
   * you should call cancelRef.current() when you don't need to await return promise anymore
   * waitUtil will throw cancel Error when cancelRef.current is called
   * if method 'where' return false, the event will be ignored
   * @template K
   * @param {K} event event name
   * @param {{
        timeout?: number default to 0
        cancelRef?: { current: () => void }
        where?: (...args: Arguments<M[K]>) => boolean
      }} [config={}]
   * @returns {void; }; where?: (...args: any) => boolean; }) => any}
   */
  public waitUtil = <K extends keyof M = keyof M>(
    event: K,
    config: WaitUtilConfig<Arguments<M[K]>> = {},
  ) => {
    const { timeout = 0, cancelRef, where } = config

    return new Promise<Arguments<M[K]>>((res, rej) => {
      let timeID: number | undefined
      let resolved = false

      const callback = async (...args: any) => {
        // only if where return

        if (where) {
          try {
            const isValid = where(...args)
            if (!isValid) return
          } catch (error) {
            rej(error)
            if (timeID !== undefined) clearTimeout(timeID)
            // @ts-ignore
            this.off(event, callback)
            return
          }
        }

        resolved = true
        if (timeID !== undefined) clearTimeout(timeID)
        res(args)
        // @ts-ignore
        this.off(event, callback)
      }
      // @ts-ignore
      this.on(event, callback)
      const cancel = () => {
        if (resolved) return
        if (timeID !== undefined) clearTimeout(timeID)
        // @ts-ignore
        this.off(event, callback)
        rej(errors.CancelError)
      }
      // eslint-disable-next-line no-param-reassign
      if (cancelRef && typeof cancelRef === 'object') cancelRef.current = cancel
      if (timeout > 0) {
        timeID = setTimeout(() => {
          rej(errors.TimeoutError)
          // @ts-ignore
          this.off(event, callback)
        }, timeout) as unknown as number
      }
    })
  }

  /**
   * waitUtilAll wait util all event success fired
   * if any waitUtil failure , waitUtilAll will failure

   * @async
   * @template K
   * @template EventList
   * @param {EventList} eventList
   * @returns {Promise<{
      -readonly [P in keyof EventList]: Arguments<M[EventList[P]['event']]>
    }>}
   */
  public waitUtilAll = async <
    K extends keyof M = keyof M,
    EventList extends readonly Readonly<EventListItem<M, K>>[] = readonly Readonly<
      EventListItem<M, K>
    >[],
  >(
    eventList: EventList,
  ): Promise<{
    -readonly [P in keyof EventList]: Arguments<M[EventList[P]['event']]>
  }> => {
    type Result = {
      -readonly [P in keyof EventList]: Arguments<M[EventList[P]['event']]>
    }

    return this.#innerGroupWaitUtil(eventList, 'all') as Result
  }

  /**
   * waitUtilRace wait util any waitUtil promise success or failure
   *
   * @async
   * @template K
   * @param {EventListItem<M, K>[]} eventList
   * @returns {Promise<K extends keyof M ? Arguments<M[K]> : never>}
   */
  public waitUtilRace = async <K extends keyof M = keyof M>(
    eventList: EventListItem<M, K>[],
  ): Promise<K extends keyof M ? Arguments<M[K]> : never> => {
    type Result = K extends keyof M ? Arguments<M[K]> : never

    return this.#innerGroupWaitUtil(eventList, 'race') as Result
  }

  /**
   * waitUtilAny wait util any waitUtil promise success or all failure
   *
   * @async
   * @template K
   * @param {EventListItem<M, K>[]} eventList
   * @returns {Promise<K extends keyof M ? Arguments<M[K]> : never>}
   */
  public waitUtilAny = async <K extends keyof M = keyof M>(
    eventList: EventListItem<M, K>[],
  ): Promise<K extends keyof M ? Arguments<M[K]> : never> => {
    type Result = K extends keyof M ? Arguments<M[K]> : never

    return this.#innerGroupWaitUtil(eventList, 'any') as Result
  }

  /**
   * create Observer with access control that observer can only listen to specify events , and other behavior
   * @param {ObserverAccessControl}
   * @returns {IAccessControlObserver}
   */
  public createObserver = <K extends keyof M>({ events = [] }: ObserverAccessControl<K> = {}) => {
    const observer: IAccessControlObserver<M, K> = Object.freeze({
      on: (key: K, callback: M[K]) => {
        if (!events.includes(key)) throw errors.AccessControlError
        this.on(key, callback)
        return this.off.bind(this, key, callback)
      },
      once: this.once,
      off: this.off,
      waitUtil: this.waitUtil,
    })
    return observer
  }

  /**
   * create Publisher with access control that can publish specify events , or control and other behavior
   * @param {PublisherAccessControl}
   * @returns {IAccessControlPublisher}
   */
  public createPublisher = <K extends keyof M>({
    events = [],
    canInterceptEmit = true,
    canUnInterceptEmit = true,
  }: PublisherAccessControl<K> = {}): IAccessControlPublisher<M, K> => {
    const publisher: IAccessControlPublisher<M, K> = Object.freeze({
      emit: (key: K, ...args: Parameters<M[K]>) => {
        if (!events.includes(key)) throw errors.AccessControlError
        this.emit(key, ...args)
        return this
      },
      interceptEmit: () => {
        if (!canInterceptEmit) throw errors.AccessControlError
        this.interceptEmit()
      },
      unInterceptEmit: () => {
        if (!canUnInterceptEmit) throw errors.AccessControlError
        this.unInterceptEmit()
      },
    })
    return publisher
  }

  #innerGroupWaitUtil = async <
    K extends keyof M = keyof M,
    EventList = readonly Readonly<EventListItem<M, K>>[],
  >(
    eventList: EventList,
    promiseType: 'any' | 'race' | 'all',
  ): Promise<unknown> => {
    if (!Array.isArray(eventList) || eventList.length <= 0) {
      throw Error('eventList must be array with at least one type')
    }

    const waitUtilListWithCancelRef = eventList.map(({ event, ...config }) => {
      const cancelRef = { current: () => {} }
      if (config.cancelRef) {
        // eslint-disable-next-line no-param-reassign
        config.cancelRef.current = () => {
          cancelRef.current?.()
        }
      }

      return {
        // @ts-ignore
        waitUtil: this.waitUtil(event, {
          ...config,
          cancelRef,
        }),
        cancelRef,
      }
    })

    try {
      switch (promiseType) {
        case 'all': {
          const result = await Promise.all(
            waitUtilListWithCancelRef.map(({ waitUtil }) => waitUtil),
          )
          return result
        }
        case 'any': {
          const result = await Promise.any(
            waitUtilListWithCancelRef.map(({ waitUtil }) => waitUtil),
          )
          return result
        }
        case 'race': {
          const result = await Promise.race(
            waitUtilListWithCancelRef.map(({ waitUtil }) => waitUtil),
          )
          return result
        }
        default:
          throw Error('wrong promise type')
      }
    } finally {
      waitUtilListWithCancelRef.forEach(({ cancelRef }) => {
        cancelRef.current()
      })
    }
  }
}
