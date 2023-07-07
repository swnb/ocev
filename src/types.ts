export type HandlerMap = Record<string, (...arg: any) => void | Promise<void>>

export type CancelRef = { current: () => void }

export type WaitUtilConfig<Args extends any[]> = {
  timeout?: number
  cancelRef?: CancelRef
  where?: (...args: Args) => boolean
}

export type EventListItem<M extends HandlerMap, K extends keyof M> = K extends keyof M
  ? {
      event: K
    } & WaitUtilConfig<Arguments<M[K]>>
  : never

export interface ISyncEvent<M extends HandlerMap> {
  /**
   * observer only allow to call method : 'on' | 'once' | 'off' | 'waitUtil'
   */
  readonly observer: Pick<this, 'on' | 'once' | 'off' | 'waitUtil'>
  /**
   * publisher only allow to call method : 'emit' | 'interceptEmit' | 'unInterceptEmit'
   */
  readonly publisher: Pick<this, 'emit' | 'interceptEmit' | 'unInterceptEmit'>
  /**
   * interceptEmit will stop all emit
   * util unInterceptEmit is called
   */
  interceptEmit: VoidFunction
  /**
   * interceptEmit will resume all emit
   * nothing will happen if interceptEmit is not called
   */
  unInterceptEmit: VoidFunction
  /**
   *
   * @param type  event type , same as emit event type
   * @param handler  callback will run when emit same event type
   * @returns
   */
  on: <K extends keyof M>(type: K, handler: M[K]) => LinkableListener<M>
  /**
   * @param type event type
   * @param handler  callback only run one time
   * @returns
   */
  once: <K extends keyof M>(type: K, handler: M[K]) => LinkableListener<M>
  /**
   * auto clear all callback
   * @param type
   * @returns {this}
   */
  /**
   * @param handler  any emit will emit handler
   * @returns
   */
  any: (
    handler: <T extends keyof M = keyof M>(type: T, ...args: Arguments<M[T]>) => any,
  ) => VoidFunction
  offAll: <K extends keyof M>(type?: K | undefined) => this
  off: <K extends keyof M>(type: K, handler: M[K]) => this
  emit: <K extends keyof M>(type: K, ...arg: Parameters<M[K]>) => this
  waitUtil: <K extends keyof M>(
    type: K,
    config?: WaitUtilConfig<Arguments<M[K]>>,
  ) => Promise<Arguments<M[K]>>
  /**
   * create Observer with access control that observer can only listen to specify events , and other behavior
   * @param {ObserverAccessControl}
   * @returns {Observer}
   */
  createObserver: <K extends keyof M>(
    accessControl?: ObserverAccessControl<K>,
  ) => IAccessControlObserver<M, K>
  /**
   * create Publisher with access control that can publish specify events , and other behavior
   * @param {PublisherAccessControl}
   * @returns {Publisher}
   */
  createPublisher: <K extends keyof M>(
    accessControl?: PublisherAccessControl<K>,
  ) => IAccessControlPublisher<M, K>
}

export type Arguments<T> = T extends (...args: infer R) => void ? R : never

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

export interface IAccessControlPublisher<M extends HandlerMap, K extends keyof M>
  extends Pick<ISyncEvent<M>, 'interceptEmit' | 'unInterceptEmit'> {
  emit: (type: K, ...arg: Parameters<M[K]>) => this
}

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
  on: <K extends keyof M>(type: K, handler: M[K]) => LinkableListener<M>
}
