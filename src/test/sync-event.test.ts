import { SyncEvent } from '..'

// define event handler type

type EventHandlerMap = {
  ev1: (v1: string, v2: number) => void
  ev2: (v1: number, v2: string) => void
}

const eventBus = new SyncEvent<EventHandlerMap>()

async function main() {
  const cancelRef1 = { current: () => {} }
  const cancelRef2 = { current: () => {} }
  for (;;) {
    await Promise.race([
      eventBus.waitUtil('ev1', { cancelRef: cancelRef1 }),
      eventBus.waitUtil('ev2', { cancelRef: cancelRef2 }),
    ])
    cancelRef1.current()
    cancelRef2.current()
    // do something
  }
}

eventBus.waitUtilRace(['ev1', 'ev2']).then(v => {
  console.log(v)
})

const result = eventBus.waitUtilAll(['ev1', 'ev2'], {
  where(ev1, ev2) {
    return true
  },
})

setTimeout(() => {
  eventBus.dispatch('ev2', 10, '')
}, 1000)

console.log('here')
eventBus.on('ev1', () => {}).on('ev2', () => {})
console.log(
  'here end',
  eventBus.on('ev1', () => {}),
)
