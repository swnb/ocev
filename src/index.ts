class SyncEvent<M extends Record<string, (...arg: any) => void>> {
  #handlerMap = new Map<keyof M, Set<M[keyof M]>>()

  #isInterceptDispatch = false

  #sequencePromiseHandlerMap = new Map<M[keyof M], Promise<void>>()

  #onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M]>()

  protected eventNamespace = ''

  /**
   * @deprecated since version 0.5.0
   * will remove in version 0.6.0
   * use interceptDispatch instead
   */
  public deaf = () => {}

  /**
   * interceptDispatch will stop all dispatch
   * util unInterceptDispatch is called
   */
  public interceptDispatch = () => {
    this.#isInterceptDispatch = true
  }

  /**
   * @deprecated since version 0.5.0
   * will remove in version 0.6.0
   * use reListen instead
   */
  public listen = () => {
    this.unInterceptDispatch()
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
   * @returns
   */
  public autoClear = <K extends keyof M>(type?: K) => {
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
    if (this.#isInterceptDispatch) return

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
  public waitUtil = <K extends keyof M>(type: K, timeout: number = 0) => {
    return new Promise<Arguments<M[K]>>((res, rej) => {
      let timeID: number | undefined
      const callback = (...args: any) => {
        if (timeID !== undefined) clearTimeout(timeID)
        res(args)
      }
      // @ts-ignore
      this.once(type, callback)
      if (timeout > 0) {
        timeID = setTimeout(rej, timeout) as unknown as number
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
}

type Arguments<T> = T extends (...args: infer R) => void ? R : never

export { SyncEvent }
