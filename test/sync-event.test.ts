import { SyncEvent } from '../src'

// define event handler type

type EventHandlerMap = {
  ev1: (v1: string, v2: number) => void
  ev2: (v1: number, v2: string) => void
}

test('test sync event listenerCount', () => {
  const eventEmitter = SyncEvent.new<EventHandlerMap>()
  let cancelAll = eventEmitter.on('ev1', () => {}).on('ev2', () => {})
  expect(eventEmitter.listenerCount).toBe(2)
  cancelAll()
  expect(eventEmitter.listenerCount).toBe(0)
  cancelAll = eventEmitter.once('ev1', () => {}).on('ev2', () => {})
  expect(eventEmitter.listenerCount).toBe(2)
  cancelAll()
  expect(eventEmitter.listenerCount).toBe(0)
  cancelAll = eventEmitter.once('ev1', () => {})
  expect(eventEmitter.listenerCount).toBe(1)
  cancelAll()
  expect(eventEmitter.listenerCount).toBe(0)

  eventEmitter
    .on('ev1', () => {})
    .once('ev1', () => {})
    .on('ev2', () => {})

  eventEmitter
    .on('ev2', () => {})
    .once('ev2', () => {})
    .on('ev1', () => {})
  expect(eventEmitter.listenerCount).toBe(6)

  eventEmitter.offAll()

  expect(eventEmitter.listenerCount).toBe(0)

  const callback1 = () => {}
  eventEmitter.once('ev1', callback1)
  expect(eventEmitter.listenerCount).toBe(1)
  eventEmitter.off('ev1', callback1)
  expect(eventEmitter.listenerCount).toBe(0)

  const callback2 = () => {}
  eventEmitter.on('ev1', callback2)
  expect(eventEmitter.listenerCount).toBe(1)
  eventEmitter.off('ev2', callback2)
  eventEmitter.off('ev1', callback1)
  expect(eventEmitter.listenerCount).toBe(1)
  eventEmitter.off('ev1', callback2)
  expect(eventEmitter.listenerCount).toBe(0)
})

test('test sync event on and once', () => {
  const eventEmitter = SyncEvent.new<EventHandlerMap>()
  let count = 0
  const cancelAll = eventEmitter
    .on('ev1', (_, v) => {
      count += v
    })
    .once('ev2', v => {
      count -= v
    })

  expect(count).toBe(0)

  eventEmitter.dispatch('ev1', '', 2)

  expect(count).toBe(2)

  eventEmitter.dispatch('ev2', 1, '')

  expect(count).toBe(1)

  eventEmitter.dispatch('ev2', 1, '')

  expect(count).toBe(1)

  eventEmitter.dispatch('ev1', '', 1)

  expect(count).toBe(2)

  cancelAll()

  eventEmitter.dispatch('ev1', '', 1)

  expect(count).toBe(2)
})

test('test sync event', () => {})
