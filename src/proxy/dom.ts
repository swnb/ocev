import { SyncEvent } from 'src/sync-event'

type ValueOf<E, K extends keyof E = keyof E> = K extends keyof E ? E[K] : never

type GetAddEventListenerKeys<
  E extends ValueOf<HTMLElementTagNameMap>,
  Keys extends keyof E = keyof E,
> = Keys extends `on${string}`
  ? E[Keys] extends null | ((...args: any[]) => any)
    ? E[Keys] extends ((...args: any[]) => any) | null
      ? Keys
      : never
    : never
  : never

type PrettierListenerKey<Key> = Key extends `on${infer SubString}` ? SubString : never

type UnionEventHandler<E, Keys extends keyof E> = {
  [key in Keys as PrettierListenerKey<key>]: E[key] extends ((...args: infer Args) => any) | null
    ? (...args: Args) => void
    : never
}

type FindKeyByValue<
  E,
  Value extends E[keyof E],
  Key extends keyof E = keyof E,
> = E[Key] extends Value ? Key : never

export class DomEventProxyAgent<T extends HTMLElement> extends SyncEvent<
  UnionEventHandler<T, GetAddEventListenerKeys<T>>
> {
  #dom: T

  #removeEvenListenerQueue: (readonly [string, (...args: any[]) => void])[] = []

  get dom() {
    return this.#dom
  }

  constructor(dom: T | FindKeyByValue<HTMLElementTagNameMap, T>) {
    super()

    if (typeof dom === 'string') {
      const element = document.createElement(dom)

      if (!(element instanceof HTMLElement)) {
        throw Error("don't support element which don't extends HTMLElement ")
      }

      this.#dom = element as any as T
    } else {
      this.#dom = dom
    }

    this.#proxyElement(this.#dom)
  }

  static create<T extends keyof HTMLElementTagNameMap>(nodeName: T) {
    return new DomEventProxyAgent(nodeName)
  }

  static proxy<T extends HTMLElement>(dom: T) {
    return new DomEventProxyAgent(dom)
  }

  #proxyElement(dom: T) {
    const eventKeys: string[] = []

    const findAllEventName = (object: Record<string, any>) => {
      Object.keys(object)
        .filter(key => key.startsWith('on'))
        .filter(key => object[key] === null || typeof object[key] === 'function')
        .forEach(key => {
          eventKeys.push(key)
        })
    }

    let extendsObject = Object.getPrototypeOf(dom)
    while (extendsObject) {
      findAllEventName(extendsObject)
      extendsObject = Object.getPrototypeOf(extendsObject)
    }

    eventKeys.forEach(key => {
      const pair = [
        key.slice(2),
        (...args: any[]) => {
          ;(this as unknown as SyncEvent<any>).dispatch(key as any, ...args)
        },
      ] as const
      dom.addEventListener(pair[0], pair[1])

      this.#removeEvenListenerQueue.push(pair)
    })
  }

  destroy = () => {
    this.#removeEvenListenerQueue.forEach(pair => {
      this.#dom.removeEventListener(pair[0], pair[1])
    })
  }
}