import type {
  HandlerMap,
  ISyncEvent,
  Arguments,
  ObserverAccessControl,
  IAccessControlObserver,
  PublisherAccessControl,
  IAccessControlPublisher,
} from './types'
import { errors } from 'src'

export class SyncEvent<M extends HandlerMap> implements ISyncEvent<M> {
  #handlerMap = new Map<keyof M, Set<M[keyof M]>>()

  #isInterceptDispatch = false

  #onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M]>()

  #observer: Pick<this, 'on' | 'once' | 'off' | 'waitUtil'>

  #publisher: Pick<this, 'dispatch' | 'interceptDispatch' | 'unInterceptDispatch'>

  constructor() {
    this.#observer = Object.freeze({
      on: this.on,
      once: this.once,
      off: this.off,
      waitUtil: this.waitUtil,
    })
    this.#publisher = Object.freeze({
      dispatch: this.dispatch,
      interceptDispatch: this.interceptDispatch,
      unInterceptDispatch: this.unInterceptDispatch,
    })
  }

  // factory pattern
  static new<M extends HandlerMap>() {
    return new SyncEvent<M>()
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
   * @return {VoidFunction} function off handler
   */
  public on = <K extends keyof M>(type: K, handler: M[K]): VoidFunction => {
    if (this.#handlerMap.has(type)) {
      this.#handlerMap.get(type)!.add(handler)
    } else {
      const set = new Set<M[K]>()
      set.add(handler)
      this.#handlerMap.set(type, set)
    }
    return this.off.bind(null, type, handler)
  }

  /**
   * @param type event type
   * @param handler  callback only run one time
   * @returns
   */
  public once = <K extends keyof M>(type: K, handler: M[K]) => {
    const handlerWrapper = (...arg: Arguments<M[K]>) => {
      // @ts-ignore
      this.off(type, handler)
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
   * unregister all callback
   * @param type
   * @returns {this}
   */
  public offAll = <K extends keyof M>(type?: K): this => {
    if (type) {
      // FIXME memory leak
      this.#handlerMap.set(type, new Set())
    } else {
      this.#handlerMap = new Map()
      this.#onceHandlerWrapperMap = new Map()
    }
    return this
  }

  public off = <K extends keyof M>(type: K, handler: M[K]) => {
    const handlers = this.#handlerMap.get(type)
    if (handlers) {
      handlers.delete(handler)
    }

    const handlerWrapper = this.#onceHandlerWrapperMap.get(handler)
    if (handlerWrapper) {
      this.#onceHandlerWrapperMap.delete(handler)
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
        // @ts-ignore
        handler(...arg)
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
      let resolved = false

      const callback = (...args: any) => {
        resolved = true
        if (timeID !== undefined) clearTimeout(timeID)
        res(args)
      }
      // @ts-ignore
      this.once(type, callback)
      const cancel = () => {
        if (resolved) return
        if (timeID !== undefined) clearTimeout(timeID)
        // @ts-ignore
        this.off(type, callback)
        rej(errors.CancelError)
      }
      // eslint-disable-next-line no-param-reassign
      if (cancelRef && typeof cancelRef === 'object') cancelRef.current = cancel
      if (timeout > 0) {
        timeID = setTimeout(() => {
          rej(errors.TimeoutError)
          // @ts-ignore
          this.off(type, callback)
        }, timeout) as unknown as number
      }
    })
  }

  // TODO : impl waitUtilAll event list
  #waitUtilAll = <EventList extends readonly [keyof M, ...(keyof M)[]]>(
    typeList: EventList,
    timeout: number = 0,
    cancelRef?: { current: () => void },
  ) => {
    // // ? Head extends K
    // // ? Tail extends K[]
    // // ? TransformEventList2ArgumentsList<Tail, [...ArgumentsList, Arguments<M[Head]>]>
    // // : never
    // // : never
    // // : never
    // return new Promise<TransformEventList2ArgumentsList<EventList, M, []>>(res => {})
  }

  /**
   *
   * @param {K[]} typeList the eventName list
   * @param {number?} timeout default set to zero, when large than zero , promise will reject errors.TimeoutError
   * @param {{current:VoidFunction}} cancelRef set current field ,when call cancelRef.current(), promise will throw errors.CancelError
   * @returns race result
   */
  public waitUtilRace = <K extends keyof M>(
    typeList: K[],
    timeout: number = 0,
    cancelRef?: { current: VoidFunction },
  ) => {
    if (!Array.isArray(typeList)) throw Error('typeList must be array')

    type Result = K extends keyof M ? Arguments<M[K]> : never
    return new Promise<Result>((res, rej) => {
      let timeID: number | undefined
      let emitIndex = -1

      const callbackList = typeList.map((type, currentIndex) => {
        const callback = (...args: any[]) => {
          res(args as any)

          emitIndex = currentIndex
          callbackList.forEach((fn, index) => {
            if (currentIndex === index) return

            this.off(typeList[index], fn as any)
          })

          if (timeID !== undefined) clearTimeout(timeID)
        }
        this.once(type, callback as any)
        return callback
      })

      const cancel = () => {
        rej(errors.CancelError)
        callbackList.forEach((fn, index) => {
          if (index === emitIndex) return

          this.off(typeList[index], fn as any)
        })

        if (timeID !== undefined) clearTimeout(timeID)
      }

      if (timeout > 0) {
        timeID = setTimeout(() => {
          rej(errors.TimeoutError)
          cancel()
        }, timeout)
      }

      // eslint-disable-next-line no-param-reassign
      if (cancelRef) cancelRef.current = cancel
    })
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