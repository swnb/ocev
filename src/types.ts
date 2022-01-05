export type HandlerMap = Record<string, (...arg: any) => void | Promise<void>>

export interface ISyncEvent<M extends HandlerMap> {
  /**
   * observer only allow to call method : 'on' | 'once' | 'sequenceOn' | 'cancel' | 'waitUtil'
   */
  readonly observer: Pick<this, 'on' | 'once' | 'sequenceOn' | 'cancel' | 'waitUtil'>
  /**
   * publisher only allow to call method : 'dispatch' | 'interceptDispatch' | 'unInterceptDispatch'
   */
  readonly publisher: Pick<this, 'dispatch' | 'interceptDispatch' | 'unInterceptDispatch'>
  /**
   * interceptDispatch will stop all dispatch
   * util unInterceptDispatch is called
   */
  interceptDispatch: VoidFunction
  /**
   * interceptDispatch will resume all dispatch
   * nothing will happen if interceptDispatch is not called
   */
  unInterceptDispatch: VoidFunction
  /**
   *
   * @param type  event type , same as dispatch event type
   * @param handler  callback will run when dispatch same event type
   * @returns
   */
  on: <K extends keyof M>(type: K, handler: M[K]) => this
  /**
   * @param type event type
   * @param handler  callback only run one time
   * @returns
   */
  once: <K extends keyof M>(type: K, handler: M[K]) => this
  /**
   * auto clear all callback
   * @param type
   * @returns {this}
   */
  autoClear: <K extends keyof M>(type?: K | undefined) => this
  cancel: <K extends keyof M>(type: K, handler: M[K]) => this
  dispatch: <K extends keyof M>(type: K, ...arg: Parameters<M[K]>) => this
  waitUtil: <K extends keyof M>(
    type: K,
    timeout?: number,
    cancelRef?: {
      current: () => void
    },
  ) => Promise<Arguments<M[K]>>
  sequenceOn: <K extends keyof M>(type: K, handler: M[K]) => this
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
  canInterceptDispatch?: boolean
  canUnInterceptDispatch?: boolean
}

export type ObserverAccessControl<Events> = AccessControl<Events>

export interface IAccessControlObserver<M extends HandlerMap, K extends keyof M>
  extends Pick<ISyncEvent<M>, 'once' | 'sequenceOn' | 'cancel' | 'waitUtil'> {
  on: (type: K, handler: M[K]) => this
}

export interface IAccessControlPublisher<M extends HandlerMap, K extends keyof M>
  extends Pick<ISyncEvent<M>, 'interceptDispatch' | 'unInterceptDispatch'> {
  dispatch: (type: K, ...arg: Parameters<M[K]>) => this
}
