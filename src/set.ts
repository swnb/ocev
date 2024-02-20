// wrapper of Set
export class CollectionSet<Value> {
  #set = new Set<Value>()

  forEach = this.#set.forEach.bind(this.#set)

  get size() {
    return this.#set.size
  }

  has = (value: Value): boolean => {
    return this.#set.has(value)
  }

  // return false if value is already in this set, but will update anyway
  add = (value: Value) => {
    const result = !this.#set.has(value)
    this.#set.add(value)
    return result
  }

  delete = (value: Value): boolean => {
    return this.#set.delete(value)
  }

  clear = () => {
    this.#set.clear()
  }
}
