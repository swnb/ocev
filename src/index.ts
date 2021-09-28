class SyncEvent<M extends Record<string, (...arg: any) => void>> {
  #handlerMap = new Map<keyof M, Set<M[keyof M]>>()

  #isDeaf = false

  #sequenceCallbackPromiseMap = new Map<M[keyof M], Promise<void>>()

  #onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M]>()

  protected eventNamespace = ''

  public deaf = () => {
    this.#isDeaf = true
  }

  public listen = () => {
    this.#isDeaf = false
  }

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

  public dispatch = <K extends keyof M>(type: K, ...arg: Parameters<M[K]>) => {
    // 一段时间内不可以监听事件
    if (this.#isDeaf) return

    const handlers = this.#handlerMap.get(type)
    if (handlers) {
      handlers.forEach(handler => {
        // if handler is sequence
        if (this.#sequenceCallbackPromiseMap.has(handler)) {
          const nextPromise = this.#sequenceCallbackPromiseMap
            .get(handler)!
            // @ts-ignore
            .then(() => handler(...arg))
          this.#sequenceCallbackPromiseMap.set(handler, nextPromise)
        } else {
          // @ts-ignore
          handler(...arg)
        }
      })
    }
    return this
  }

  public waitUtil = <K extends keyof M>(type: K, timeout?: number) => {
    return new Promise<Arguments<M[K]>>((res, rej) => {
      let timeID: number | undefined
      const callback = (...args: any) => {
        if (timeID !== undefined) clearTimeout(timeID)
        res(args)
      }
      // @ts-ignore
      this.once(type, callback)
      if (timeout) {
        timeID = setTimeout(rej, timeout) as unknown as number
      }
    })
  }

  // each callback will exec one by one
  public sequenceOn = <K extends keyof M>(type: K, handler: M[K]) => {
    if (this.#handlerMap.has(type)) {
      this.#handlerMap.get(type)!.add(handler)
      // add sequence callback
      this.#sequenceCallbackPromiseMap.set(handler, Promise.resolve())
    } else {
      const set = new Set<M[K]>()
      set.add(handler)
      this.#sequenceCallbackPromiseMap.set(handler, Promise.resolve())
      this.#handlerMap.set(type, set)
    }
    return this
  }
}

type Arguments<T> = T extends (...args: infer R) => void ? R : never

export { SyncEvent }
