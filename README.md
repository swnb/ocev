# swnb/event

> event module

```typescript

// define event handler type

type HandlerMap = {
  foo: (x: number, y: number) => void
  bar: (z: string) => void
}

class EventCenter extends SyncEvent<HandlerMap> {}

const ev = new EventCenter()

s.on('bar', z => {
  console.log(z)
})

s.once('foo', (x, y) => {
  console.log(x, y)
})

s.dispatch('bar', 'f')

s.dispatch('foo', 1, 2)

```
