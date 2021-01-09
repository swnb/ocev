# swnb/event

> event module

## install

```shell
npm install @swnb/event
```

```shell
yarn add @swnb/event
```

## example

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
