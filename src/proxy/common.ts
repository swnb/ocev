export type ValueOf<E, K extends keyof E = keyof E> = K extends keyof E ? E[K] : never

export type GetAddEventListenerKeys<E, Keys extends keyof E = keyof E> = Keys extends `on${string}`
  ? E[Keys] extends null | ((...args: any[]) => any)
    ? E[Keys] extends ((...args: any[]) => any) | null
      ? Keys
      : never
    : never
  : never

type PrettierListenerKey<Key> = Key extends `on${infer SubString}` ? SubString : never

export type UnionEventHandler<E, Keys extends keyof E> = {
  [key in Keys as PrettierListenerKey<key>]: E[key] extends ((...args: infer Args) => any) | null
    ? (...args: Args) => void
    : never
}
