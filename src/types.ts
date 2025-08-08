export type HandlerMap = Record<string, (...arg: any) => void | Promise<void>>

export type CancelRef = { current: () => void }

export type WaitUtilConfig<Args extends any[]> = {
  timeout?: number // Optional timeout for the waitUtil method.
  cancelRef?: CancelRef // Reference to a cancellation function to avoid memory leaks.
  where?: (...args: Args) => boolean // Optional condition function to filter events.
  mapToError?: (...args: Args) => any // Optional function to map event arguments to an error.
}

export type EventListItem<M extends HandlerMap, K extends keyof M> = K extends keyof M
  ? {
      event: K
    } & WaitUtilConfig<Arguments<M[K]>>
  : never

export interface ISyncEvent<M extends HandlerMap> {
  /**
   * Get listener count by event name
   * If no event name is passed, returns the total number of listeners for all events.
   * @param {K} event eventName
   * @returns {number} listener count
   */
  listenerCount: <K extends keyof M>(event?: K | undefined) => number

  /**
   * Register an event handler for the specified event.
   * @param {K} event Event name
   * @param {M[K]} handler Event handler callback function
   * @param {ListenerOptions} [options] Listener options support debounce and throttle , more details in the document
   * @returns {LinkableListener<M>} Linkable listener object for chaining
   */
  on: <K extends keyof M>(event: K, handler: M[K], options?: ListenerOptions) => LinkableListener<M>
  /**
   * Add a handler which listen to any emitted event.
   * this return value of any can't be chained
   * @template K - The type representing keys of the handler map.
   * @param {Function} handler - The function to be invoked when any event is emitted.
   * @returns {Function} - A function that, when called, removes the added handler.
   */
  any: <K extends keyof M = keyof M>(
    handler: (event: K, ...args: Arguments<M[K]>) => void,
  ) => () => void
  /**
   * Register a handler to be executed only once when the specified event is emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The event to listen for.
   * @param {M[K]} handler - The handler function to be executed when the event is emitted.
   * @returns {LinkableListener<M>} - An object containing methods to manage the listener.
   */
  once: <K extends keyof M>(event: K, handler: M[K]) => LinkableListener<M>
  /**
   * Removes all handlers for the specified event or clears all handlers if no event is specified.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} [event] - The event for which handlers should be removed. If not provided, all handlers are cleared.
   * @returns {this} - The instance of the event emitter for chaining.
   */
  offAll: <K extends keyof M>(event?: K | undefined) => void
  /**
   * Removes a specific handler for the specified event.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The event from which the handler should be removed.
   * @param {M[K]} handler - The handler function to be removed.
   * @returns {this} - The instance of the event emitter for chaining.
   */
  off: <K extends keyof M>(event: K, handler: M[K]) => this
  /**
   * Emits the specified event with the provided arguments, invoking all registered handlers for the event.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The event to be emitted.
   * @param {...Arguments<M[K]>} args - The arguments to be passed to the event handlers.
   * @returns {this} - The instance of the event emitter for chaining.
   */
  emit: <K extends keyof M>(event: K, ...args: Arguments<M[K]>) => this
  /**
   * Returns a promise that resolves when the specified event is emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {K} event - The name of the event to wait for.
   * @param {WaitUtilConfig<Arguments<M[K]>>} [config={}] - Configuration options for the waitUtil method.
   * @returns {Promise<Arguments<M[K]>>} - A promise that resolves with the event arguments.
   */
  waitUtil: <K extends keyof M = keyof M>(
    event: K,
    config?: WaitUtilConfig<Arguments<M[K]>>,
  ) => Promise<Arguments<M[K]>>
  /**
   * Waits for any event in the specified list to be emitted.
   * If all events fail, the promise is rejected.
   * If any event succeeds, the promise is resolved.
   *
   * @template K - The type representing keys of the handler map.
   * @template EventList - The type representing the list of events to wait for.
   * @param {EventList} eventList - The list of events to wait for.
   * @returns {Promise<ExtractHandlerMapArgumentsFromEventListItem<M, K, EventList>>} - A promise that resolves with the arguments of all emitted events.
   */
  waitUtilAll: <
    K extends keyof M = keyof M,
    EventList extends readonly (K | Readonly<EventListItem<M, K>>)[] = readonly (
      | K
      | Readonly<EventListItem<M, K>>
    )[],
  >(
    eventList: EventList,
  ) => Promise<ExtractHandlerMapArgumentsFromEventListItem<M, K, EventList>>
  /**
   * Waits for the first event in the specified list to be emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {((EventListItem<M, K> | K)[])} eventList - The list of events to wait for.
   * @returns {Promise<WaitUtilCommonReturnValue<M, K>>} - A promise that resolves with the result of the first emitted event.
   */
  waitUtilRace: <K extends keyof M = keyof M>(
    eventList: (K | EventListItem<M, K>)[],
  ) => Promise<WaitUtilCommonReturnValue<M, K>>
  /**
   * Waits for any event in the specified list to be emitted.
   *
   * @template K - The type representing keys of the handler map.
   * @param {((EventListItem<M, K> | K)[])} eventList - The list of events to wait for.
   * @returns {Promise<WaitUtilCommonReturnValue<M, K>>} - A promise that resolves with the result of the first emitted event from the list.
   */
  waitUtilAny: <K extends keyof M = keyof M>(
    eventList: (K | EventListItem<M, K>)[],
  ) => Promise<WaitUtilCommonReturnValue<M, K>>
  /**
   * Creates a stream producer with support for async iteration.
   * Strategy will work when strategy.capacity is large than zero
   * producer will either 'drop' or 'replace' new event when event queue's length is equal to capacity
   * @param {K[]} eventList - An array of events to subscribe to.
   * @param {EventStreamStrategy} strategy - The strategy to apply when the stream is full.
   * @returns {Object} - An object with methods for async iteration and event count information.
   */
  createEventStream: <K extends keyof M = keyof M>(
    eventList: K[],
    strategy?: EventStreamStrategy,
  ) => {
    [Symbol.asyncIterator]: () => {
      next: () => Promise<{
        value: WaitUtilCommonReturnValue<M, K>
        done: boolean
      }>
      return: () => Promise<{
        value: WaitUtilCommonReturnValue<M, K>
        done: boolean
      }>
    }
    droppedEventCount: () => number
    replacedEventCount: () => number
  }
  /**
   * Creates a ReadableStream containing the event stream.
   *
   * @param {K[]} eventList - An array of events to subscribe to.
   * @param {EventStreamStrategy} strategy - The strategy to apply when the stream is full.
   * @returns {ReadableStream} - A ReadableStream containing the event stream.
   */
  createEventReadableStream: <K extends keyof M = keyof M>(
    eventList: K[],
    strategy?: EventStreamStrategy,
  ) => ReadableStream<WaitUtilCommonReturnValue<M, K>>

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
  get subscriber(): Subscriber<M>

  /**
   * Publisher only allow to call method 'emit'
   */
  get publisher(): Pick<this, 'emit'>
}

export type Arguments<T extends (...args: any) => any> = T extends (...args: infer R) => void
  ? R
  : never

type AccessControl<Event> = {
  events?: Event[]
}

export type PublisherAccessControl<Events> = AccessControl<Events> & {
  canInterceptEmit?: boolean
  canUnInterceptEmit?: boolean
}

export type ObserverAccessControl<Events> = AccessControl<Events>

export interface IAccessControlObserver<M extends HandlerMap, K extends keyof M>
  extends Pick<ISyncEvent<M>, 'once' | 'off' | 'waitUtil'> {
  on: (type: K, handler: M[K]) => VoidFunction
}

export interface IAccessControlPublisher<M extends HandlerMap, K extends keyof M> {
  emit: (type: K, ...arg: Arguments<M[K]>) => this
}

export type Subscriber<M extends HandlerMap> = Pick<
  ISyncEvent<M>,
  | 'on'
  | 'once'
  | 'off'
  | 'offAll'
  | 'waitUtil'
  | 'any'
  | 'waitUtilRace'
  | 'waitUtilAll'
  | 'waitUtilAny'
  | 'createEventStream'
  | 'createEventReadableStream'
>

export type TransformEventList2ArgumentsList<
  List extends readonly (keyof M)[],
  M extends Record<string, (...args: any[]) => void>,
  ArgumentsList extends any[] = [],
> = List['length'] extends 0
  ? ArgumentsList
  : List extends readonly [infer Head, ...infer Tail]
  ? Head extends keyof M
    ? Tail extends (keyof M)[]
      ? TransformEventList2ArgumentsList<Tail, M, [...ArgumentsList, ...Arguments<M[Head]>]>
      : never
    : never
  : never

export interface LinkableListener<M> {
  (): void
  once: <K extends keyof M>(type: K, handler: M[K]) => LinkableListener<M>
  on: <K extends keyof M>(type: K, handler: M[K], options?: ListenerOptions) => LinkableListener<M>
}

export type ExtractHandlerMapArgumentsFromEventListItem<
  M extends HandlerMap,
  K extends keyof M,
  EventList extends readonly (Readonly<EventListItem<M, K>> | K)[] = readonly (
    | Readonly<EventListItem<M, K>>
    | K
  )[],
> = {
  -readonly [P in keyof EventList]: Arguments<
    M[EventList[P] extends K
      ? EventList[P]
      : EventList[P] extends EventListItem<M, K>
      ? EventList[P]['event']
      : never]
  >
}

export type WaitUtilCommonReturnValue<
  M extends Record<any, any>,
  K extends keyof M,
> = K extends keyof M ? { event: K; value: Arguments<M[K]> } : never

export type EventStreamStrategy = {
  capacity: number // is capacity is zero , means Infinity;
  strategyWhenFull: 'drop' | 'replace'
}

export type ListenerOptions = {
  debounce?: {
    waitMs: number
    maxWaitMs?: number
  }
  throttle?: {
    waitMs: number
  }
}

export type ListenerConfig = {
  lastEmitMs: number
  debounce?: {
    waitMs: number
    timerId: number
    expectExecTimeMs: number
    delayMs: number
    maxWaitMs: number
  }
  throttle?: {
    waitMs: number
  }
}

export type SyncEventOptions = {
  useDateAsTimeTool?: boolean
}

export type OmitUndefinedKeyInObject<V> = V extends Record<any, any>
  ? {
      [K in keyof V]-?: OmitUndefinedKeyInObject<V[K]>
    }
  : V
