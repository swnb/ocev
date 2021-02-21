class SyncEvent<M extends Record<string, (...arg: any) => void>> {
  protected eventNamespace = ''

  private handlerMap = new Map<keyof M, Set<M[keyof M]>>()

  private onceHandlerWrapperMap = new Map<M[keyof M], M[keyof M]>()

  public on = <K extends keyof M>(type: K, handler: M[K]) => {
    if (this.handlerMap.has(type)) {
      this.handlerMap.get(type)!.add(handler)
    } else {
      const set = new Set<M[K]>()
      set.add(handler)
      this.handlerMap.set(type, set)
    }
    return this
  }

  public once = <K extends keyof M>(type: K, handler: M[K]) => {
    const handlerWrapper = (...arg: Parameters<M[K]>) => {
      // @ts-ignore
      this.cancel(type, handlerWrapper)
      handler(...arg)
    }
    // @ts-ignore
    this.on(type, handlerWrapper)
    // @ts-ignore
    this.onceHandlerWrapperMap.set(handler, handlerWrapper)
    return this
  }

  public autoClear = <K extends keyof M>(type?: K) => {
    if (type) {
      this.handlerMap.set(type, new Set())
    } else {
      this.handlerMap = new Map()
      this.onceHandlerWrapperMap = new Map()
    }
    return this
  }

  public cancel = <K extends keyof M>(type: K, handler: M[K]) => {
    const handlers = this.handlerMap.get(type)
    if (handlers) {
      handlers.delete(handler)
    }

    const handlerWrapper = this.onceHandlerWrapperMap.get(handler)
    if (handlerWrapper) {
      this.onceHandlerWrapperMap.delete(handler)
      if (handlers) {
        handlers.delete(handlerWrapper)
      }
      return this
    }

    return this
  }

  public dispatch = <K extends keyof M>(type: K, ...arg: Parameters<M[K]>) => {
    const handlers = this.handlerMap.get(type)
    if (handlers) {
      handlers.forEach(handler => {
        // @ts-ignore
        handler(...arg)
      })
    }
    return this
  }

  public waitUtil = <K extends keyof M>(type: K, timeout?: number) => {
    return new Promise<Arguments<M[K]>>((res, rej) => {
      const callback = (...args: any) => {
        res(args)
      }
      // @ts-ignore
      this.once(type, callback)
      if (timeout) {
        setTimeout(rej, timeout)
      }
    })
  }
}

type Arguments<T> = T extends (...args: infer R) => void ? R : never

export { SyncEvent }
