import { SyncEvent } from '.'

type HandlerMap = {
  foo: (x: number, y: number) => void
  bar: (z: string) => void
}

class S extends SyncEvent<HandlerMap> {}

const s = new S()

s.on('bar', z => {
  console.log(z)
})

s.once('foo', (x, y) => {
  console.log(x, y)
})

const cancelOnceHandler = (x: number, y: number) => {
  console.log('second', x, y)
}

s.once('foo', cancelOnceHandler)

s.cancel('foo', cancelOnceHandler)

const cancelHandler = () => {
  console.log('cancel')
  s.cancel('bar', cancelHandler)
}

s.on('bar', cancelHandler)

s.dispatch('bar', 'f')
s.dispatch('foo', 1, 2)
s.dispatch('bar', 'd')
s.dispatch('foo', 5, 0)
s.dispatch('bar', 'x')
