import { SyncEvent } from '..'

// define event handler type

type EventHandlerMap = {
  ev1: (v1: string) => void
  ev2: (v2: number) => void
}

const eventBus = new SyncEvent<EventHandlerMap>()

async function main() {
  const cancelRef1 = { current: () => {} }
  const cancelRef2 = { current: () => {} }
  for (;;) {
    await Promise.race([
      eventBus.waitUtil('ev1', 0, cancelRef1),
      eventBus.waitUtil('ev2', 0, cancelRef2),
    ])
    cancelRef1.current()
    cancelRef2.current()
    // do something
  }
}

eventBus.waitUtilRace(['ev1', 'ev2']).then(v => {
  console.log(v)
})

setTimeout(() => {
  eventBus.dispatch('ev2', 10)
}, 1000)

console.log('here')
eventBus.on('ev1', () => {}).on('ev2', () => {})
console.log(
  'here end',
  eventBus.on('ev1', () => {}),
)
