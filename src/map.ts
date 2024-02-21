export class CollectionMap<M extends Record<any, any>> {
  #map = new Map()

  has = <K extends keyof M>(key: K): boolean => {
    return this.#map.has(key)
  }

  get = <K extends keyof M>(key: K): M[K] | undefined => {
    return this.#map.get(key)
  }

  set = <K extends keyof M>(key: K, value: M[K]) => {
    const result = !this.has(key)
    this.#map.set(key, value)
    return result
  }

  delete = <K extends keyof M>(key: K): M[K] | undefined => {
    const value = this.#map.get(key)
    if (value !== undefined) {
      this.#map.delete(key)
    }
    return value
  }

  clear = () => {
    this.#map.clear()
  }
}
