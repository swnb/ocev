import type {
  Arguments,
  HandlerMap,
  IAccessControlObserver,
  IAccessControlPublisher,
  ISyncEvent,
  ObserverAccessControl,
  PublisherAccessControl,
} from './types'
import * as errors from './errors'

class SyncEvent<M extends HandlerMap> implements ISyncEvent<M> {
  #handlerMap = new Map<keyof M, Set<M[keyof M]>>()

  #isInterceptDispatch = false

  #sequencePromiseHandlerMap = new Map<M[keyof M], Promise<void>>()

  #onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M]>()

  #observer: Pick<this, 'on' | 'once' | 'sequenceOn' | 'cancel' | 'waitUtil'>

  #publisher: Pick<this, 'dispatch' | 'interceptDispatch' | 'unInterceptDispatch'>

  protected eventNamespace = ''

  constructor() {
    this.#observer = Object.freeze({
      on: this.on,
      once: this.once,
      sequenceOn: this.sequenceOn,
      cancel: this.cancel,
      waitUtil: this.waitUtil,
    })
    this.#publisher = Object.freeze({
      dispatch: this.dispatch,
      interceptDispatch: this.interceptDispatch,
      unInterceptDispatch: this.unInterceptDispatch,
    })
  }

  /**
   * observer only allow to call method : 'on' | 'once' | 'sequenceOn' | 'cancel' | 'waitUtil'
   */
  get observer() {
    return this.#observer
  }

  /**
   * publisher only allow to call method : 'dispatch' | 'interceptDispatch' | 'unInterceptDispatch'
   */
  get publisher() {
    return this.#publisher
  }

  /**
   * interceptDispatch will stop all dispatch
   * util unInterceptDispatch is called
   */
  public interceptDispatch = () => {
    this.#isInterceptDispatch = true
  }

  /**
   * interceptDispatch will resume all dispatch
   * nothing will happen if interceptDispatch is not called
   */
  public unInterceptDispatch = () => {
    this.#isInterceptDispatch = true
  }

  /**
   *
   * @param type  event type , same as dispatch event type
   * @param handler  callback will run when dispatch same event type
   * @returns
   */
  public on = <K extends keyof M>(type: K, handler: M[K]) => {
    if (this.#handlerMap.has(type)) {
      this.#handlerMap.get(type)!.add(handler)
    } else {
      const set = new Set<M[K]>()
      set.add(handler)
      this.#handlerMap.set(type, set)
    }
    return this
  }

  /**
   * @param type event type
   * @param handler  callback only run one time
   * @returns
   */
  public once = <K extends keyof M>(type: K, handler: M[K]) => {
    const handlerWrapper = (...arg: Arguments<M[K]>) => {
      // @ts-ignore
      this.cancel(type, handlerWrapper)
      // @ts-ignore
      handler(...arg)
    }
    // @ts-ignore
    this.on(type, handlerWrapper)
    // @ts-ignore
    this.#onceHandlerWrapperMap.set(handler, handlerWrapper)
    return this
  }

  /**
   * auto clear all callback
   * @param type
   * @returns {this}
   */
  public autoClear = <K extends keyof M>(type?: K): this => {
    if (type) {
      this.#handlerMap.set(type, new Set())
    } else {
      this.#handlerMap = new Map()
      this.#onceHandlerWrapperMap = new Map()
    }
    return this
  }

  public cancel = <K extends keyof M>(type: K, handler: M[K]) => {
    const handlers = this.#handlerMap.get(type)
    if (handlers) {
      handlers.delete(handler)
    }

    const handlerWrapper = this.#onceHandlerWrapperMap.get(handler)
    if (handlerWrapper) {
      this.#onceHandlerWrapperMap.delete(handler)
      if (handlers) {
        handlers.delete(handlerWrapper)
      }
      return this
    }

    return this
  }

  // dispatch event type and some arguments
  // all register will call with the arguments
  public dispatch = <K extends keyof M>(type: K, ...arg: Parameters<M[K]>) => {
    // 一段时间内不可以监听事件
    if (this.#isInterceptDispatch) return this

    const handlers = this.#handlerMap.get(type)
    if (handlers) {
      handlers.forEach(handler => {
        // if handler is sequence
        if (this.#sequencePromiseHandlerMap.has(handler)) {
          const nextPromise = this.#sequencePromiseHandlerMap
            .get(handler)!
            // @ts-ignore
            .then(() => handler(...arg))
          this.#sequencePromiseHandlerMap.set(handler, nextPromise)
        } else {
          // @ts-ignore
          handler(...arg)
        }
      })
    }
    return this
  }

  // waitUil return promise which will resolve util the event type is dispatch
  // cancelRef will set current property cancel function
  // cancelRef is design to avid memory leak
  // you should call cancelRef.current() when you don't need to await return promise anymore
  // waitUtil will throw cancel Error when cancelRef.current is called
  public waitUtil = <K extends keyof M>(
    type: K,
    timeout: number = 0,
    cancelRef?: { current: () => void },
  ) => {
    return new Promise<Arguments<M[K]>>((res, rej) => {
      let timeID: number | undefined
      const callback = (...args: any) => {
        if (timeID !== undefined) clearTimeout(timeID)
        res(args)
      }
      // @ts-ignore
      this.once(type, callback)
      const cancel = () => {
        if (timeID !== undefined) clearTimeout(timeID)
        // @ts-ignore
        this.cancel(type, callback)
        rej(errors.CancelError)
      }
      // eslint-disable-next-line no-param-reassign
      if (cancelRef && typeof cancelRef === 'object') cancelRef.current = cancel
      if (timeout > 0) {
        timeID = setTimeout(() => {
          rej(errors.TimeoutError)
          // @ts-ignore
          this.cancel(type, callback)
        }, timeout) as unknown as number
      }
    })
  }

  // each callback will exec after the previous callback return promise is resolved
  public sequenceOn = <K extends keyof M>(type: K, handler: M[K]) => {
    if (this.#handlerMap.has(type)) {
      this.#handlerMap.get(type)!.add(handler)
      // add sequence callback
      this.#sequencePromiseHandlerMap.set(handler, Promise.resolve())
    } else {
      const set = new Set<M[K]>()
      set.add(handler)
      this.#sequencePromiseHandlerMap.set(handler, Promise.resolve())
      this.#handlerMap.set(type, set)
    }
    return this
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
        return this
      },
      once: this.once,
      sequenceOn: this.sequenceOn,
      cancel: this.cancel,
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
    canInterceptDispatch = true,
    canUnInterceptDispatch = true,
  }: PublisherAccessControl<K> = {}): IAccessControlPublisher<M, K> => {
    const publisher: IAccessControlPublisher<M, K> = Object.freeze({
      dispatch: (key: K, ...args: Parameters<M[K]>) => {
        if (!events.includes(key)) throw errors.AccessControlError
        this.dispatch(key, ...args)
        return this
      },
      interceptDispatch: () => {
        if (!canInterceptDispatch) throw errors.AccessControlError
        this.interceptDispatch()
      },
      unInterceptDispatch: () => {
        if (!canUnInterceptDispatch) throw errors.AccessControlError
        this.unInterceptDispatch()
      },
    })
    return publisher
  }
}

export { SyncEvent, errors }
