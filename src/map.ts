export class CollectionMap<M extends Record<string, any>> {
  #map = new Map()

  has = <K extends keyof M>(key: K): boolean => {
    return this.#map.has(key)
  }

  get = <K extends keyof M>(key: K): M[K] | undefined => {
    return this.#map.get(key)
  }

  set = <K extends keyof M>(key: K, value: M[K]) => {
    this.#map.set(key, value)
  }

  delete = <K extends keyof M>(key: K): boolean => {
    return this.#map.delete(key)
  }

  clear = () => {
    this.#map.clear()
  }
}
