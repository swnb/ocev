# @swnb/event

> pub/sub module implement with typescript

## install

```shell
npm install @swnb/event
```

or

```shell
yarn add @swnb/event
```

## usage

define event handler map

```typescript

import { SyncEvent } from '@swnb/event'

// define event handler type

type EventHandlerMap = {
  bar: (z: string) => void
}

```

create instance

```typescript

const eventBus = new SyncEvent<EventHandlerMap>()
// or
// const eventBus = SyncEvent.new<EventHandlerMap>()
```

register event callback

```typescript

eventBus.on('bar', z => {
  // z is type string
})

eventBus.once('bar',z =>{
  // this callback only execute one time
})

```

dispatch event with argument

```typescript
eventBus.dispatch('bar', '')
```

cancel register callback

```typescript
const callback = (z: string) => {}
eventBus.on('bar', callback)
eventBus.cancel('bar', callback)

eventBus.autoClear() // cancel all register callback
eventBus.autoClear('bar') // only cancel event type bar callback
```

## use promise

### use method 'waitUtil' instead of method 'on'

you can use method on to register callback

```typescript
const callback = (z: string) => {}
eventBus.on('bar', callback)
```

you can also use promise with loop to do the same thing

```typescript
const callback = (z: string) => {}

async function waitUtil() {
  for (;;) {
    const z = await eventBus.waitUtil('bar') // this code block util eventBus dispatch event 'bar'
    callback(z)
  }
}
waiUtil()
```

you might be confused, code like this doesn't seem to make sense

but this is useful when you want to await some event to happen  

for example , create websocket connection and 'waitUtil' websocket open

```typescript
async function main() {
  const ws = new WebSocket('')
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  // after websocket is open 
}
```

you can custom your websocket class use SyncEvent to do the same thing

```typescript
class CustomWebsocket extends SyncEvent<{ open: VoidFunction }> {
  constructor(url: string) {
    ...
  }
  ...
}

async function main() {
  const ws = new CustomWebsocket('')
  await ws.waitUtil('open')
  // after websocket is open 
}
```

> method 'waitUtil' accept second argument timeout, if timeout less than or equal to zero, 'waitUtil' will block util dispatch, default set to zero

in situation below , throw error when connection timeout

```typescript
async function main() {
  const ws = new WebSocket('')
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
    setTimeout(() => {
      rej(Error('timeout')) // throw Error if websocket doesn't open after 1s
    }, 1000)
  })
  // after websocket is open
}
```

you can use waitUtil with timeout to do the same thing

```typescript
const ws = new CustomWebsocket('')
await ws.waitUtil('open', 1000) // throw TimeoutError after 1s
```

### avoid memory leak in some case

think this situation ,if you want to Promise.race some 'event'

```typescript
async function main() {
  for (;;) {
    await Promise.race([eventBus.waitUtil('ev1'), eventBus.waitUtil('ev2')])
    // do something
  }
}
```

if 'ev1' dispatch usually and 'ev2' never dispatch , ev2 will register lots of callback , that cause memory leak

to avoid that , method 'waitUtil' accept third argument 'cancelRef'，call method cancelRef['current'] will cancel register

code below will avoid memory leak

```typescript
async function main() {
  const cancelRef1 = { current: () => {} }
  const cancelRef2 = { current: () => {} }
  for (;;) {
    await Promise.race([
      eventBus.waitUtil('ev1', 0, cancelRef1),
      eventBus.waitUtil('ev2', 0, cancelRef2),
    ])
    // cancel register
    cancelRef1.current() 
    cancelRef2.current()
    // do something
  }
}
```

## observer and publisher

> to be continue
