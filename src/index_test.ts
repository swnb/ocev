import { SyncEvent } from '.'

type HandlerMap = {
  foo: (x: number, y: number) => void
  bar: (z: string) => void
}

class S extends SyncEvent<HandlerMap> {}

const s = new S()

s.sequenceOn('bar', async () => {
  console.log('1s')
  await new Promise(res => {
    setTimeout(res, 4000)
  })
  console.log('emit')
})

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
;(async () => {
  const a = await s.waitUtil('foo')
  console.log('wait')
  console.log(a[0], a[1])
})()

setTimeout(() => {
  s.dispatch('foo', 8, 0)
}, 1000)
