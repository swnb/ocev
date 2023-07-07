/**
 * @jest-environment jsdom
 */

import { EventProxy, SyncEvent } from '../src'

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

  eventEmitter.emit('ev1', '', 2)

  expect(count).toBe(2)

  eventEmitter.emit('ev2', 1, '')

  expect(count).toBe(1)

  eventEmitter.emit('ev2', 1, '')

  expect(count).toBe(1)

  eventEmitter.emit('ev1', '', 1)

  expect(count).toBe(2)

  cancelAll()

  eventEmitter.emit('ev1', '', 1)

  expect(count).toBe(2)
})

test('test event proxy', () => {
  const div = document.createElement('div')

  const divEventProxyAgent = EventProxy.new(div)

  let anyCount = 0
  divEventProxyAgent.any((evType, ...args) => {
    expect(evType).toBe('click')
    anyCount += 1
  })

  let clickCount = 0

  const cancel = divEventProxyAgent.on('click', () => {
    clickCount += 1
  })

  div.click()

  expect(clickCount).toBe(1)

  div.click()

  expect(clickCount).toBe(2)

  cancel()

  div.click()

  expect(clickCount).toBe(2)

  expect(anyCount).toBe(2)
})

test('test any event proxy', () => {
  const div = document.createElement('div')

  const divEventProxyAgent = EventProxy.new(div, { proxyAllEvent: true })

  let anyCount = 0
  divEventProxyAgent.any((ev: any) => {
    expect(ev).toBe('click')
    anyCount += 1
  })

  let clickCount = 0

  const cancel = divEventProxyAgent.on('click', () => {
    clickCount += 1
  })

  div.click()

  expect(clickCount).toBe(1)

  div.click()

  expect(clickCount).toBe(2)

  cancel()

  div.click()

  expect(clickCount).toBe(2)

  expect(anyCount).toBe(3)
})

test('test sync event waitUtil', async () => {
  const div = document.createElement('div')

  const divEventProxyAgent = EventProxy.new(div)
  for (let i = 0; i < 3; i++) {
    await Promise.all([
      divEventProxyAgent.waitUtil('click', {
        timeout: 1000,
        where(ev) {
          expect(ev.type).toBe('click')
          return ev.type === 'click'
        },
      }),
      new Promise<void>(res => {
        res()
        div.click()
      }),
    ])
  }
})

test('test sync event bind for global', async () => {
  let globalEventProxyAgent = EventProxy.new(global)

  let count = 0

  const p = globalEventProxyAgent.waitUtil('resize', {
    timeout: 3000,
    where(ev) {
      expect(ev.type).toBe('resize')
      count += 1
      return count === 2
    },
  })

  ;(async () => {
    for (let i = 0; i < 2; i++) {
      global.dispatchEvent(new Event('resize'))
      await new Promise<void>(r => {
        setTimeout(r, 1000)
      })
    }
  })()

  await p

  expect(count).toBe(2)

  globalEventProxyAgent = EventProxy.new(global, { proxyAllEvent: true })

  let clickCount = 0

  globalEventProxyAgent.on('click', () => {
    clickCount += 1
  })

  globalEventProxyAgent.any((ev, ...args) => {
    if (ev === 'click') {
      clickCount += 1
    }
  })

  global.dispatchEvent(new Event('click'))

  expect(clickCount).toBe(2)
})

test('test waitUtilAll', async () => {
  const globalEventProxyAgent = EventProxy.new(global)

  setTimeout(() => {
    global.dispatchEvent(new Event('click'))
    setTimeout(() => {
      global.dispatchEvent(new Event('focus'))
    }, 1000)
  }, 1000)

  const [ev1, ev2] = await globalEventProxyAgent.waitUtilAll([
    {
      event: 'click',
      timeout: 1500,
    },
    {
      event: 'focus',
      timeout: 2500,
      where(ev) {
        expect(ev.type).toBe('focus')
        return ev.type === 'focus'
      },
    },
  ] as const)

  expect(ev1[0].type).toBe('click')

  expect(ev2[0].type).toBe('focus')
})

test('test waitUtilRace', async () => {
  const globalEventProxyAgent = EventProxy.new(global)

  setTimeout(() => {
    global.dispatchEvent(new Event('click'))
  }, 20)

  const [ev] = await globalEventProxyAgent.waitUtilRace([
    {
      event: 'click',
      timeout: 500,
    },
    {
      event: 'focus',
      timeout: 1000,
      where(ev) {
        expect(ev.type).toBe('focus')
        return ev.type === 'focus'
      },
    },
  ])

  expect(ev.type).toBe('click')
})

test('test waitUtilAny', async () => {
  const globalEventProxyAgent = EventProxy.new(global)

  setTimeout(() => {
    global.dispatchEvent(new Event('click'))
  }, 1000)

  const result1 = await globalEventProxyAgent.waitUtilAny([
    {
      event: 'click',
      timeout: 1500,
    },
    {
      event: 'focus',
      timeout: 500,
      where(ev) {
        expect(ev.type).toBe('focus')
        return ev.type === 'focus'
      },
    },
  ])

  expect(result1[0].type).toBe('click')

  setTimeout(() => {
    global.dispatchEvent(new Event('focus'))
  }, 1000)

  await globalEventProxyAgent
    .waitUtilAny([
      {
        event: 'click',
        timeout: 1500,
      },
      {
        event: 'focus',
        timeout: 500,
        where(ev) {
          expect(ev.type).toBe('focus')
          return ev.type === 'focus'
        },
      },
    ])
    .catch(err => {
      expect(err instanceof AggregateError).toBe(true)
    })
})
