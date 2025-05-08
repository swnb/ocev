import type {
  HandlerMap,
  ISyncEvent,
  Arguments,
  // ObserverAccessControl,
  // IAccessControlObserver,
  // PublisherAccessControl,
  // IAccessControlPublisher,
  LinkableListener,
  WaitUtilConfig,
  EventListItem,
  ExtractHandlerMapArgumentsFromEventListItem,
  EventStreamStrategy,
  WaitUtilCommonReturnValue,
  ListenerOptions,
  ListenerConfig,
  SyncEventOptions,
} from './types'
import { errors } from './index'
import { CollectionMap } from './map'
import { createListenerLinker } from './linkable-listener'
import { RingBuffer } from './ring-buffer'
import { CollectionSet } from './set'
import { EventRecorder } from './recorder'

/**
 * SyncEvent support register , emit, cancel and promise/stream
 * @template M type of all handlers and event
 */
export class SyncEvent<M extends HandlerMap> implements ISyncEvent<M> {
  #handlerMap = new CollectionMap<{
    [K in keyof M]: CollectionSet<M[K]>
  }>()

  #onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M] & { type: keyof M }>()

  #anyHandlerSet = new CollectionSet<(...args: any[]) => any>()

  #subscriber: Pick<
    this,
    | 'on'
    | 'once'
    | 'off'
    | 'offAll'
    | 'any'
    | 'waitUtil'
    | 'waitUtilRace'
    | 'waitUtilAll'
    | 'waitUtilAny'
    | 'createEventStream'
    | 'createEventReadableStream'
  >

  #publisher: Pick<this, 'emit'>

  #listenerCount = 0

  #listenerConfigMap = new Map<M[keyof M], ListenerConfig>()

  #getCurrentTimeMs

  constructor(options?: SyncEventOptions) {
    this.#subscriber = Object.freeze({
      on: this.on,
      any: this.any,
      once: this.once,
      off: this.off,
      offAll: this.offAll,
      waitUtil: this.waitUtil,
      waitUtilRace: this.waitUtilRace,
      waitUtilAll: this.waitUtilAll,
      waitUtilAny: this.waitUtilAny,
      createEventStream: this.createEventStream,
      createEventReadableStream: this.createEventReadableStream,
    })
    this.#publisher = Object.freeze({ emit: this.emit })

    if (
      options?.useDateAsTimeTool ||
      typeof performance !== 'object' ||
      typeof performance.now !== 'function'
    ) {
      this.#getCurrentTimeMs = () => Date.now()
    } else {
      this.#getCurrentTimeMs = () => performance.now()
    }
  }

  /**
   * Observer only allow to call methods below:
   *| 'on'
    | 'once'
    | 'off'
    | 'offAll'
    | 'any'
    | 'waitUtil'
    | 'waitUtilRace'
    | 'waitUtilAll'
    | 'waitUtilAny'
    | 'createEventStream'
    | 'createEventReadableStream'
   */
  get subscriber() {
    return this.#subscriber
  }

  /**
   * Publisher only allow to call method 'emit'
   */
  get publisher() {
    return this.#publisher
  }

  /**
   * Create new SyncEvent
   * @returns {SyncEvent<M>} 新的 SyncEvent 实例
   * @static
   */
  static new<M extends HandlerMap>(): SyncEvent<M> {
    return new SyncEvent<M>()
  }

  /**
   * Get listener count by event name
   * If no event name is passed, returns the total number of listeners for all events.
   * @param {K} event eventName
   * @returns {number} listener count
   */
  public listenerCount = <K extends keyof M>(event?: K): number => {
    if (event === undefined) {
      return this.#listenerCount
    }
    return (this.#handlerMap.get(event)?.size ?? 0) + this.#anyHandlerSet.size
  }

  /**
   * Register an event handler for the specified event.
   * @param {K} event Event name
   * @param {M[K]} handler Event handler callback function
   * @param {ListenerOptions} [options] Listener options support debounce and throttle , more details in the document
   * @returns {LinkableListener<M>} Linkable listener object for chaining
   */
  public on = <K extends keyof M>(
    event: K,
    handler: M[K],
    options?: ListenerOptions,
  ): LinkableListener<M> => {
    if (options) {
      const config = this.#validListenerOptions(options)
      this.#listenerConfigMap.set(handler, config)
    }

    const handlersSet = this.#handlerMap.get(event)
    if (handlersSet) {
      const addResult = handlersSet.add(handler)
      if (addResult) {
        this.#listenerCount += 1
      }
    } else {
      const newHandlersSet = new CollectionSet<M[K]>()
      newHandlersSet.add(handler)
      this.#handlerMap.set(event, newHandlersSet)
      this.#listenerCount += 1
    }

    const cancelFunction = this.off.bind(null, event, handler)

    return createListenerLinker(this.on, this.once, [cancelFunction])
  }

  /**
   * Add a handler which listen to any emitted event.
   * this return value of any can't be chained
   * @template K - The type representing keys of the handler map.
   * @param {Function} handler - The function to be invoked when any event is emitted.
   * @returns {Function} - A function that, when called, removes the added handler.
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
   * Register a handler to be executed only once when the specified event is emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The event to listen for.
   * @param {M[K]} handler - The handler function to be executed when the event is emitted.
   * @returns {LinkableListener<M>} - An object containing methods to manage the listener.
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
   * Removes all handlers for the specified event or clears all handlers if no event is specified.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} [event] - The event for which handlers should be removed. If not provided, all handlers are cleared.
   */
  public offAll = <K extends keyof M>(event?: K): this => {
    if (event) {
      // FIXME memory leak
      this.#listenerCount -= this.#handlerMap.delete(event)?.size ?? 0
      this.#handlerMap.set(event, new CollectionSet())
    } else {
      this.#handlerMap.clear()
      this.#onceHandlerWrapperMap.clear()
      this.#anyHandlerSet.clear()
      this.#listenerCount = 0
    }

    return this
  }

  /**
   * Removes a specific handler for the specified event.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The event from which the handler should be removed.
   * @param {M[K]} handler - The handler function to be removed.
   * @returns {this} - The instance of the event emitter for chaining.
   */
  public off = <K extends keyof M>(event: K, handler: M[K]): this => {
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

  /**
   * Emits the specified event with the provided arguments, invoking all registered handlers for the event.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The event to be emitted.
   * @param {...Arguments<M[K]>} args - The arguments to be passed to the event handlers.
   * @returns {this} - The instance of the event emitter for chaining.
   */
  public emit = <K extends keyof M>(event: K, ...args: Arguments<M[K]>): this => {
    const handlers = this.#handlerMap.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          const config = this.#listenerConfigMap.get(handler)
          if (config && (config.debounce || config?.throttle)) {
            this.#callHandlerWithConfig(handler as any, args as Arguments<M[K]>, config)
          } else {
            // @ts-ignore
            handler(...args)
          }
        } catch {}
      })
    }

    this.#anyHandlerSet.forEach(handler => {
      try {
        // @ts-ignore
        handler(event, ...args)
      } catch {}
    })

    return this
  }

  /**
   * Returns a promise that resolves when the specified event is emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The name of the event to wait for.
   * @param {WaitUtilConfig<Arguments<M[K]>>} [config={}] - Configuration options for the waitUtil method.
   * @returns {Promise<Arguments<M[K]>>} - A promise that resolves with the event arguments.
   */
  public waitUtil = <K extends keyof M = keyof M>(
    event: K,
    config: WaitUtilConfig<Arguments<M[K]>> = {},
  ): Promise<Arguments<M[K]>> => {
    if (!event) {
      throw Error('event must be specified')
    }

    const { timeout = 0, cancelRef, where, mapToError } = config

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

        if (mapToError && typeof mapToError === 'function') {
          try {
            const errorToThrow = mapToError(...args)
            if (!(errorToThrow == null)) {
              rej(errorToThrow)
            } else {
              // still resolve
              res(args)
            }
          } catch (error) {
            rej(error)
          }
        } else {
          res(args)
        }

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
      if (cancelRef && typeof cancelRef === 'object') {
        cancelRef.current = cancel
      }

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
   * Waits for all events in the specified list to be emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @template EventList - The type representing the list of events to wait for.
   * @param {EventList} eventList - The list of events to wait for.
   * @returns {Promise<ExtractHandlerMapArgumentsFromEventListItem<M, K, EventList>>} - A promise that resolves with the arguments of all emitted events.
   */
  public waitUtilAll = async <
    K extends keyof M = keyof M,
    EventList extends readonly (Readonly<EventListItem<M, K>> | K)[] = readonly (
      | Readonly<EventListItem<M, K>>
      | K
    )[],
  >(
    eventList: EventList,
  ): Promise<ExtractHandlerMapArgumentsFromEventListItem<M, K, EventList>> => {
    type Result = ExtractHandlerMapArgumentsFromEventListItem<M, K, EventList>

    return this.#innerGroupWaitUtil(this.#wrapEventList(eventList), 'all') as Result
  }

  /**
   * Waits for the first event in the specified list to be emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {((EventListItem<M, K> | K)[])} eventList - The list of events to wait for.
   * @returns {Promise<WaitUtilCommonReturnValue<M, K>>} - A promise that resolves with the result of the first emitted event.
   */
  public waitUtilRace = async <K extends keyof M = keyof M>(
    eventList: (EventListItem<M, K> | K)[],
  ): Promise<WaitUtilCommonReturnValue<M, K>> => {
    type Result = Promise<WaitUtilCommonReturnValue<M, K>>

    return this.#innerGroupWaitUtil(this.#wrapEventList(eventList), 'race') as Result
  }

  /**
   * Waits for any event in the specified list to be emitted.
   * If all events fail, the promise is rejected.
   * If any event succeeds, the promise is resolved.
   *
   * @template K - The type representing keys of the handler map.
   * @param {((EventListItem<M, K> | K)[])} eventList - The list of events to wait for.
   * @returns {Promise<WaitUtilCommonReturnValue<M, K>>} - A promise that resolves with the result of the first emitted event from the list.
   */
  public waitUtilAny = async <K extends keyof M = keyof M>(
    eventList: (EventListItem<M, K> | K)[],
  ): Promise<WaitUtilCommonReturnValue<M, K>> => {
    type Result = Promise<WaitUtilCommonReturnValue<M, K>>

    return this.#innerGroupWaitUtil(this.#wrapEventList(eventList), 'any') as Result
  }

  /**
   * Creates a stream producer with support for async iteration.
   * Strategy will work when strategy.capacity is large than zero
   * producer will either 'drop' or 'replace' new event when event queue's length is equal to capacity
   * @param {K[]} eventList - An array of events to subscribe to.
   * @param {EventStreamStrategy} strategy - The strategy to apply when the stream is full.
   * @returns {Object} - An object with methods for async iteration and event count information.
   */
  public createEventStream = <K extends keyof M = keyof M>(
    eventList: K[],
    strategy: EventStreamStrategy = { capacity: 0, strategyWhenFull: 'replace' },
  ) => {
    if (!(typeof Symbol === 'function' && Symbol.asyncIterator)) {
      throw Error("env don't support Symbol.asyncIterator")
    }

    if (typeof strategy?.capacity !== 'number' || strategy?.capacity < 0) {
      throw Error('strategy.capacity must be non-negative integer')
    }

    if (!['drop', 'replace'].includes(strategy?.strategyWhenFull)) {
      throw Error('strategy.capacity must be either `drop` or `replace`')
    }

    let handler: {
      getValue: () => Promise<WaitUtilCommonReturnValue<M, K>>
      cancel: () => Promise<void>
      droppedEventCount?: () => number
      replacedEventCount?: () => number
    }
    if (strategy.capacity) {
      handler = this.#createEventStreamAsyncIterWithCapacity(eventList, strategy)
    } else {
      handler = this.#createEventStreamAsyncIterWithoutCapacity(eventList)
    }

    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            const value = await handler.getValue()
            return { value, done: false }
          },
          async return() {
            await handler.cancel()
            return { value: null as unknown as WaitUtilCommonReturnValue<M, K>, done: true }
          },
        }
      },
      droppedEventCount() {
        return handler.droppedEventCount?.() ?? 0
      },
      replacedEventCount() {
        return handler.replacedEventCount?.() ?? 0
      },
    }
  }

  /**
   * Creates a ReadableStream containing the event stream.
   *
   * @param {K[]} eventList - An array of events to subscribe to.
   * @param {EventStreamStrategy} strategy - The strategy to apply when the stream is full.
   * @returns {ReadableStream} - A ReadableStream containing the event stream.
   */
  public createEventReadableStream = <K extends keyof M = keyof M>(
    eventList: K[],
    strategy: EventStreamStrategy = { capacity: 0, strategyWhenFull: 'replace' },
  ) => {
    if (typeof ReadableStream !== 'function') {
      throw Error("env don't support ReadableStream")
    }

    if (typeof strategy?.capacity !== 'number' || strategy?.capacity < 0) {
      throw Error('strategy.capacity must be non-negative integer')
    }

    if (!['drop', 'replace'].includes(strategy?.strategyWhenFull)) {
      throw Error('strategy.capacity must be either `drop` or `replace`')
    }

    if (strategy.capacity) {
      return this.#createEventReadableStreamWithCapacity(eventList, strategy)
    }
    return this.#createEventReadableStreamWithoutCapacity(eventList)
  }

  /**
   * Creates an EventRecorder instance for recording events.
   *
   * @param {boolean} replaySelf - Whether to replay events on this instance.
   * @returns {EventRecorder} - The created EventRecorder instance.
   */
  public createEventRecorder({
    replaySelf = false,
  }: { replaySelf?: boolean } = {}): EventRecorder<M> {
    return new EventRecorder(this, replaySelf ? this : SyncEvent.new())
  }

  // /**
  //  * create Observer with access control that observer can only listen to specify events , and other behavior
  //  * @param {ObserverAccessControl}
  //  * @returns {IAccessControlObserver}
  //  */
  // public createObserver = <K extends keyof M>({ events = [] }: ObserverAccessControl<K> = {}) => {
  //   const observer: IAccessControlObserver<M, K> = Object.freeze({
  //     on: (key: K, callback: M[K]) => {
  //       if (!events.includes(key)) throw errors.AccessControlError
  //       this.on(key, callback)
  //       return this.off.bind(this, key, callback)
  //     },
  //     once: this.once,
  //     off: this.off,
  //     waitUtil: this.waitUtil,
  //   })
  //   return observer
  // }

  // /**
  //  * create Publisher with access control that can publish specify events , or control and other behavior
  //  * @param {PublisherAccessControl}
  //  * @returns {IAccessControlPublisher}
  //  */
  // public createPublisher = <K extends keyof M>({
  //   events = [],
  //   canInterceptEmit = true,
  //   canUnInterceptEmit = true,
  // }: PublisherAccessControl<K> = {}): IAccessControlPublisher<M, K> => {
  //   const publisher: IAccessControlPublisher<M, K> = Object.freeze({
  //     emit: (key: K, ...args: Arguments<M[K]>) => {
  //       if (!events.includes(key)) throw errors.AccessControlError
  //       this.emit(key, ...args)
  //       return this
  //     },
  //     interceptEmit: () => {
  //       if (!canInterceptEmit) throw errors.AccessControlError
  //       this.interceptEmit()
  //     },
  //     unInterceptEmit: () => {
  //       if (!canUnInterceptEmit) throw errors.AccessControlError
  //       this.unInterceptEmit()
  //     },
  //   })
  //   return publisher
  // }

  #validNumber = (value: any): value is number => {
    return typeof value === 'number' && !Number.isNaN(value)
  }

  #validListenerOptions = (options: ListenerOptions): ListenerConfig => {
    const config: ListenerConfig = {
      lastEmitMs: 0,
    }

    const { debounce, throttle } = options

    if (debounce) {
      if (!this.#validNumber(debounce.waitMs) || debounce.waitMs <= 0) {
        throw Error('debounce.waitMs must be number and large than zero')
      }

      let maxWaitMs = 0
      if (debounce.maxWaitMs) {
        if (!this.#validNumber(debounce.maxWaitMs) || debounce.maxWaitMs <= 0) {
          throw Error('debounce.maxWaitMs must be number and large than zero')
        }
        if (debounce.maxWaitMs <= debounce.waitMs) {
          throw Error('debounce.maxWaitMs must be large than debounce.waitMs')
        }
        maxWaitMs = debounce.maxWaitMs
      }

      config.debounce = {
        waitMs: debounce.waitMs,
        maxWaitMs,
        delayMs: 0,
        expectExecTimeMs: 0,
        timerId: 0,
      }
    }

    if (throttle) {
      if (!this.#validNumber(throttle.waitMs) || throttle.waitMs <= 0) {
        throw Error('throttle.waitMs must be number and large than zero')
      }

      config.throttle = {
        waitMs: throttle.waitMs,
      }
    }

    return config
  }

  #callHandlerWithConfig = <K extends keyof M>(
    handler: M[K],
    args: Arguments<M[K]>,
    configAlias: ListenerConfig,
  ) => {
    const config = configAlias

    const doIt = () => {
      config.lastEmitMs = this.#getCurrentTimeMs()
      // @ts-ignore
      handler(...args)
    }

    const { debounce, throttle } = config

    if (!debounce && !throttle) return

    if (!debounce) {
      // do throttle
      const currentTimeMs = this.#getCurrentTimeMs()
      if (config.lastEmitMs === 0 || currentTimeMs - config.lastEmitMs >= throttle!.waitMs) {
        doIt()
      }
    } else {
      // do debounce and throttle together
      // when will function be call ?
      clearTimeout(debounce.timerId)
      const currentTimeMs = this.#getCurrentTimeMs()

      const doItRightNow = () => {
        debounce.delayMs = 0
        doIt()
      }

      const doNormalDebounce = () => {
        // record delayMs
        debounce.delayMs += debounce.waitMs
        debounce.expectExecTimeMs = currentTimeMs + debounce.waitMs
        debounce.timerId = setTimeout(doItRightNow, debounce.waitMs)
      }

      if (!debounce.delayMs || !debounce.maxWaitMs) {
        doNormalDebounce()
        return
      }

      if (debounce.delayMs && debounce.maxWaitMs) {
        // function be delay, calculate if reach maxWaitMs;
        let currentDelayMs: number
        if (debounce.expectExecTimeMs > currentTimeMs) {
          currentDelayMs = debounce.delayMs - (debounce.expectExecTimeMs - currentTimeMs)
        } else {
          currentDelayMs = debounce.delayMs + (currentTimeMs - debounce.expectExecTimeMs)
        }

        if (currentDelayMs >= debounce.maxWaitMs) {
          // 超时了，不再延长
          doItRightNow()
        } else if (currentDelayMs + debounce.waitMs >= debounce.maxWaitMs) {
          const waitMs = debounce.maxWaitMs - currentDelayMs

          const MIN_ALLOW_DELAY_MS = 6

          if (waitMs >= MIN_ALLOW_DELAY_MS) {
            // 延长到最大的限制点，不在推移，直接再执行
            debounce.delayMs = debounce.maxWaitMs
            debounce.expectExecTimeMs = currentTimeMs + waitMs
            debounce.timerId = setTimeout(doItRightNow, waitMs)
          } else {
            // 没有必要再推移了
            doItRightNow()
          }
        } else {
          // 不可能触发限制，当成平常的防抖即可
          doNormalDebounce()
        }
      }
    }
  }

  #wrapEventList = <K extends keyof M = keyof M>(
    eventList: readonly (Readonly<EventListItem<M, K>> | K)[],
  ): EventListItem<M, K>[] => {
    const eventListWrapper = eventList.map(item => {
      if (typeof item === 'object') {
        return item
      }
      return {
        event: item,
      } as EventListItem<M, K>
    })
    return eventListWrapper as EventListItem<M, K>[]
  }

  #innerGroupWaitUtil = async <
    K extends keyof M = keyof M,
    EventList = readonly Readonly<EventListItem<M, K>>[],
  >(
    eventList: EventList,
    promiseType: 'any' | 'race' | 'all' | 'allsettled',
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
        event,
        cancelRef,
      }
    })

    const promises = waitUtilListWithCancelRef.map(({ waitUtil }) => waitUtil)

    try {
      switch (promiseType) {
        case 'all': {
          const result = await Promise.all(promises)
          return result
        }
        case 'any': {
          const result = await Promise.any(
            waitUtilListWithCancelRef.map(({ waitUtil, event }) =>
              waitUtil.then(value => ({ value, event })),
            ),
          )
          return result
        }
        case 'race': {
          const result = await Promise.race(
            waitUtilListWithCancelRef.map(({ waitUtil, event }) =>
              waitUtil.then(value => ({ value, event })),
            ),
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

  #createEventStreamAsyncIterWithCapacity = <K extends keyof M = keyof M>(
    eventList: K[],
    strategy: EventStreamStrategy = { capacity: 0, strategyWhenFull: 'replace' },
  ) => {
    const ringBuffer = new RingBuffer<WaitUtilCommonReturnValue<M, K>>(strategy.capacity)

    let droppedEventCount = 0
    let replacedEventCount = 0
    const cancel = eventList.reduce((pre, event: K) => {
      const callback = ((...args: Arguments<M[K]>) => {
        const cell = { event, value: args } as WaitUtilCommonReturnValue<M, K>
        const success = ringBuffer.tryWrite(cell)
        if (!success) {
          if (strategy.strategyWhenFull == 'replace') {
            ringBuffer.read()
            if (!ringBuffer.tryWrite(cell)) {
              throw Error('unreachable')
            }
            replacedEventCount += 1
          } else {
            droppedEventCount += 1
          }
        }
      }) as M[K]

      if (!pre) {
        return this.on(event, callback)
      }
      return pre.on(event, callback)
    }, null as null | LinkableListener<M>)

    return {
      async getValue() {
        const value = await ringBuffer.read()
        return value
      },
      async cancel() {
        cancel?.()
      },
      droppedEventCount() {
        return droppedEventCount
      },
      replacedEventCount() {
        return replacedEventCount
      },
    }
  }

  #createEventStreamAsyncIterWithoutCapacity = <K extends keyof M = keyof M>(eventList: K[]) => {
    const queue: WaitUtilCommonReturnValue<M, K>[] = []

    const cancel = eventList.reduce((pre, event: K) => {
      const callback = ((...args: Arguments<M[K]>) => {
        queue.push({ event, value: args } as WaitUtilCommonReturnValue<M, K>)
      }) as M[K]
      if (!pre) {
        return this.on(event, callback)
      }
      return pre.on(event, callback)
    }, null as null | LinkableListener<M>)

    const { waitUtilRace } = this

    return {
      async getValue() {
        while (queue.length === 0) {
          await waitUtilRace(eventList)
        }
        const value = queue.shift()!
        return value
      },
      async cancel() {
        cancel?.()
      },
    }
  }

  #createEventReadableStreamWithCapacity = <K extends keyof M = keyof M>(
    eventList: K[],
    strategy: EventStreamStrategy = { capacity: 0, strategyWhenFull: 'replace' },
  ) => {
    const ringBuffer = new RingBuffer<WaitUtilCommonReturnValue<M, K>>(strategy.capacity)

    let cancel: VoidFunction | null = null

    const { on } = this

    const stream = new ReadableStream<WaitUtilCommonReturnValue<M, K>>({
      start() {
        cancel = eventList.reduce((pre, event: K) => {
          const callback = ((...args: Arguments<M[K]>) => {
            const cell = {
              event,
              value: args,
            } as WaitUtilCommonReturnValue<M, K>
            const success = ringBuffer.tryWrite(cell)
            if (!success && strategy.strategyWhenFull == 'replace') {
              ringBuffer.read()
              if (!ringBuffer.tryWrite(cell)) {
                throw Error('unreachable')
              }
            }
          }) as M[K]

          if (!pre) {
            return on(event, callback)
          }

          return pre.on(event, callback)
        }, null as null | LinkableListener<M>)
      },
      async pull(controller) {
        if (controller.desiredSize === null || controller.desiredSize > 0) {
          const value = await ringBuffer.read()
          controller.enqueue(value)
        }
      },
      cancel() {
        cancel?.()
      },
    })

    return stream
  }

  #createEventReadableStreamWithoutCapacity = <K extends keyof M = keyof M>(eventList: K[]) => {
    // const queue: WaitUtilCommonReturnValue<M, K>[] = []

    let cancel: VoidFunction | null

    const { on } = this

    const stream = new ReadableStream<WaitUtilCommonReturnValue<M, K>>({
      start(controller) {
        cancel = eventList.reduce((pre, event: K) => {
          const callback = ((...args: Arguments<M[K]>) => {
            const cell = { event, value: args } as WaitUtilCommonReturnValue<M, K>
            controller.enqueue(cell)
          }) as M[K]
          if (!pre) {
            return on(event, callback)
          }
          return pre.on(event, callback)
        }, null as null | LinkableListener<M>)
      },
      // async pull(controller) {
      //   while (!queue.length) {
      //     await waitUtilRace(eventList)
      //   }

      //   let size = queue.length

      //   if (controller.desiredSize) {
      //     size = Math.min(controller.desiredSize, size)
      //   }

      //   for (let i = 0; i < size; i++) {
      //     controller.enqueue(queue.shift()!)
      //   }
      // },
      cancel() {
        cancel?.()
      },
    })

    return stream
  }
}
