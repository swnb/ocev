/**
 * @jest-environment jsdom
 */

import { EventProxy, SyncEvent } from '.'

const { TextDecoder, TextEncoder } = require('node:util')
const { ReadableStream } = require('web-streams-polyfill/ponyfill/es2018')

Object.defineProperties(globalThis, {
  ReadableStream: { value: ReadableStream },
  TextDecoder: { value: TextDecoder },
  TextEncoder: { value: TextEncoder },
})

const { Blob, File } = require('node:buffer')
const { fetch, Headers, FormData, Request, Response } = require('undici')

Object.defineProperties(globalThis, {
  fetch: { value: fetch, writable: true },
  Blob: { value: Blob },
  File: { value: File },
  Headers: { value: Headers },
  FormData: { value: FormData },
  Request: { value: Request },
  Response: { value: Response },
})

// define event handler type

type EventHandlerMap = {
  ev1: (v1: string, v2: number) => void
  ev2: (v1: number, v2: string) => void
}

test('test sync event listenerCount', () => {
  const eventEmitter = SyncEvent.new<EventHandlerMap>()
  let cancelAll = eventEmitter.on('ev1', () => {}).on('ev2', () => {})
  expect(eventEmitter.listenerCount()).toBe(2)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  expect(eventEmitter.listenerCount('ev2')).toBe(1)
  cancelAll()
  expect(eventEmitter.listenerCount()).toBe(0)
  cancelAll = eventEmitter
    .once('ev1', () => {})
    .on('ev2', () => {})
    .on('ev2', () => {})
  expect(eventEmitter.listenerCount()).toBe(3)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  expect(eventEmitter.listenerCount('ev2')).toBe(2)
  cancelAll()
  expect(eventEmitter.listenerCount()).toBe(0)
  eventEmitter.any(() => {})
  expect(eventEmitter.listenerCount()).toBe(1)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  cancelAll = eventEmitter.once('ev1', () => {})
  expect(eventEmitter.listenerCount()).toBe(2)
  cancelAll()
  expect(eventEmitter.listenerCount()).toBe(1)
  eventEmitter.offAll()
  expect(eventEmitter.listenerCount()).toBe(0)
  expect(eventEmitter.listenerCount('ev1')).toBe(0)

  eventEmitter
    .on('ev1', () => {})
    .once('ev1', () => {})
    .on('ev2', () => {})

  eventEmitter
    .on('ev2', () => {})
    .once('ev2', () => {})
    .on('ev1', () => {})
  expect(eventEmitter.listenerCount()).toBe(6)

  eventEmitter.offAll()

  expect(eventEmitter.listenerCount()).toBe(0)

  const callback1 = () => {}
  eventEmitter.once('ev1', callback1)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  eventEmitter.off('ev1', callback1)
  expect(eventEmitter.listenerCount('ev1')).toBe(0)
  expect(eventEmitter.listenerCount()).toBe(0)

  const callback2 = () => {}
  eventEmitter.on('ev1', callback2)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  eventEmitter.off('ev2', callback2)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  expect(eventEmitter.listenerCount('ev2')).toBe(0)
  eventEmitter.off('ev1', callback1)
  expect(eventEmitter.listenerCount()).toBe(1)
  expect(eventEmitter.listenerCount('ev1')).toBe(1)
  eventEmitter.off('ev1', callback2)
  expect(eventEmitter.listenerCount()).toBe(0)
  expect(eventEmitter.listenerCount('ev1')).toBe(0)
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
  divEventProxyAgent.any((evType, ..._args) => {
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

  const error = new Error('click')

  divEventProxyAgent
    .waitUtil('click', {
      mapToError: () => error,
      timeout: 500,
    })
    .catch(e => {
      expect(error).toBe(e)
    })

  div.click()
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

  globalEventProxyAgent.any((ev, ..._args) => {
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

  const error = new Error('clickHappend')

  globalEventProxyAgent
    .waitUtilAll([
      {
        event: 'click',
        mapToError() {
          return error
        },
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
    .catch(e => {
      expect(e).toBe(error)
    })

  global.dispatchEvent(new Event('click'))
})

test('test waitUtilRace', async () => {
  const globalEventProxyAgent = EventProxy.new(global)

  setTimeout(() => {
    global.dispatchEvent(new Event('click'))
  }, 20)

  const { event, value } = await globalEventProxyAgent.waitUtilRace([
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

  expect(event).toBe('click')
  expect(value[0].type).toBe('click')
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

  expect(result1.event).toBe('click')
  expect(result1.value[0].type).toBe('click')

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

  globalEventProxyAgent
    .waitUtilAny([
      {
        event: 'click',
        mapToError: () => new Error(''),
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

  global.dispatchEvent(new Event('click'))
})

test('test eventStream', async () => {
  const globalEventProxyAgent = EventProxy.new(global)

  const clickStream = globalEventProxyAgent.createEventStream(['click'])
  const maxExecTime = 10

  for (let i = 0; i < maxExecTime; i++) {
    global.dispatchEvent(new Event('click'))
  }

  let count = 0
  // eslint-disable-next-line no-restricted-syntax
  for await (const { event, value } of clickStream) {
    expect(event).toBe('click')
    expect(value[0].type).toBe('click')

    count += 1
    if (count === maxExecTime) {
      break
    }
  }

  setInterval(() => {
    global.dispatchEvent(new Event('click'))
  }, 500)

  count = 0
  const time = Date.now()
  // eslint-disable-next-line no-restricted-syntax
  for await (const { event, value } of globalEventProxyAgent.createEventStream(['click'])) {
    expect(event).toBe('click')
    expect(value[0].type).toBe('click')
    expect(Date.now() - time).toBeGreaterThan(count * 500)
    count += 1
    if (count === 3) {
      break
    }
  }
}, 10000)

test('test eventStream multi event', async () => {
  const divEventProxy = SyncEvent.new<{
    a: (v: number) => void
    b: (v: string) => void
    c: (o: boolean) => void
  }>()

  const eventStream = divEventProxy.createEventStream(['a', 'b', 'c'])

  let count = 0
  setInterval(() => {
    if (count % 3 === 0) {
      divEventProxy.emit('a', count)
    } else if (count % 3 === 1) {
      divEventProxy.emit('b', count.toString())
    } else {
      divEventProxy.emit('c', !count)
    }
    count += 1
  }, 500)

  let index = 0
  // eslint-disable-next-line no-restricted-syntax
  for await (const { event, value } of eventStream) {
    if (index % 3 === 0) {
      expect(event).toBe('a')
      expect(value[0]).toBe(index)
    } else if (index % 3 === 1) {
      expect(event).toBe('b')
      expect(value[0]).toBe(index.toString())
    } else {
      expect(event).toBe('c')
      expect(value[0]).toBe(!index)
    }
    index += 1
    if (index > 7) {
      return
    }
  }
}, 7000)

test('test eventStream strategy drop', async () => {
  const divEventProxy = EventProxy.new(document.createElement('input'))

  const eventStream = divEventProxy.createEventStream(['click', 'focus', 'input'], {
    capacity: 2,
    strategyWhenFull: 'drop',
  })

  for (let count = 0; count < 3; count++) {
    if (count % 3 === 0) {
      divEventProxy.element.dispatchEvent(new Event('click'))
    } else if (count % 3 === 1) {
      divEventProxy.element.dispatchEvent(new Event('focus'))
    } else {
      divEventProxy.element.dispatchEvent(new Event('input'))
    }
  }

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 1000)

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 2000)

  let count = 0
  // eslint-disable-next-line no-restricted-syntax
  for await (const { event, value } of eventStream) {
    if (count % 2 === 0) {
      expect(event).toBe('click')
      expect(value[0].type).toBe('click')
    } else if (count % 2 === 1) {
      expect(event).toBe('focus')
      expect(value[0].type).toBe('focus')
    }
    count += 1
    if (count >= 6) {
      return
    }
  }
})

test('test eventStream strategy replace', async () => {
  const divEventProxy = EventProxy.new(document.createElement('input'))

  const eventStream = divEventProxy.createEventStream(['click', 'focus', 'input'], {
    capacity: 2,
    strategyWhenFull: 'replace',
  })

  for (let count = 0; count < 3; count++) {
    if (count % 3 === 0) {
      divEventProxy.element.dispatchEvent(new Event('click'))
    } else if (count % 3 === 1) {
      divEventProxy.element.dispatchEvent(new Event('focus'))
    } else {
      divEventProxy.element.dispatchEvent(new Event('input'))
    }
  }

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 1000)

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 2000)

  let count = 0
  // eslint-disable-next-line no-restricted-syntax
  for await (const { event, value } of eventStream) {
    if (count % 2 === 0) {
      expect(event).toBe('focus')
      expect(value[0].type).toBe('focus')
    } else if (count % 2 === 1) {
      expect(event).toBe('input')
      expect(value[0].type).toBe('input')
    }
    count += 1
    if (count >= 6) {
      return
    }
  }
})

test('test eventReadableStream multi event', async () => {
  const divEventProxy = SyncEvent.new<{
    a: (v: number) => void
    b: (v: string) => void
    c: (o: boolean) => void
  }>()

  const eventStream = divEventProxy.createEventReadableStream(['a', 'b', 'c'])

  let count = 0
  setInterval(() => {
    if (count % 3 === 0) {
      divEventProxy.emit('a', count)
    } else if (count % 3 === 1) {
      divEventProxy.emit('b', count.toString())
    } else {
      divEventProxy.emit('c', !count)
    }
    count += 1
  }, 500)

  const reader = eventStream.getReader()

  for (let index = 0; index < 7; index++) {
    const { value: v, done } = await reader.read()

    expect(done).toBe(false)
    if (!done) {
      const { value, event } = v
      if (index % 3 === 0) {
        expect(event).toBe('a')
        expect(value[0]).toBe(index)
      } else if (index % 3 === 1) {
        expect(event).toBe('b')
        expect(value[0]).toBe(index.toString())
      } else {
        expect(event).toBe('c')
        expect(value[0]).toBe(!index)
      }
    }
  }
}, 7000)

test('test eventReadableStream cancel', async () => {
  const divEventProxy = SyncEvent.new<{
    a: (v: number) => void
    b: (v: string) => void
    c: (o: boolean) => void
  }>()

  const eventStream = divEventProxy.createEventReadableStream(['a', 'b', 'c'])

  const reader = eventStream.getReader()

  let count = 0
  setInterval(() => {
    if (count % 3 === 0) {
      divEventProxy.emit('a', count)
    } else if (count % 3 === 1) {
      divEventProxy.emit('b', count.toString())
    } else {
      divEventProxy.emit('c', !count)
    }
    if (count === 3) {
      reader.cancel()
    }
    count += 1
  }, 500)

  for (let index = 0; index < 7; index++) {
    const { value: v, done } = await reader.read()
    if (index > 3) {
      expect(done).toBe(true)
    } else {
      expect(done).toBe(false)
    }
    if (!done) {
      const { value, event } = v
      if (index % 3 === 0) {
        expect(event).toBe('a')
        expect(value[0]).toBe(index)
      } else if (index % 3 === 1) {
        expect(event).toBe('b')
        expect(value[0]).toBe(index.toString())
      } else {
        expect(event).toBe('c')
        expect(value[0]).toBe(!index)
      }
    }
  }
}, 7000)

test('test eventReadableStream strategy drop', async () => {
  const divEventProxy = EventProxy.new(document.createElement('input'))

  const eventStream = divEventProxy.createEventReadableStream(['click', 'focus', 'input'], {
    capacity: 2,
    strategyWhenFull: 'drop',
  })

  for (let count = 0; count < 3; count++) {
    if (count % 3 === 0) {
      divEventProxy.element.dispatchEvent(new Event('click'))
    } else if (count % 3 === 1) {
      divEventProxy.element.dispatchEvent(new Event('focus'))
    } else {
      divEventProxy.element.dispatchEvent(new Event('input'))
    }
  }

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 1000)

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 2000)

  const reader = eventStream.getReader()
  for (let count = 0; count < 6; count++) {
    const { value: v, done } = await reader.read()

    expect(done).toBe(false)

    if (!done) {
      const { event, value } = v
      if (count % 2 === 0) {
        expect(event).toBe('click')
        expect(value[0].type).toBe('click')
      } else if (count % 2 === 1) {
        expect(event).toBe('focus')
        expect(value[0].type).toBe('focus')
      }
    }
  }
})

test('test eventReadableStream strategy replace', async () => {
  const divEventProxy = EventProxy.new(document.createElement('input'))

  const eventStream = divEventProxy.createEventReadableStream(['click', 'focus', 'input'], {
    capacity: 2,
    strategyWhenFull: 'replace',
  })

  for (let count = 0; count < 3; count++) {
    if (count % 3 === 0) {
      divEventProxy.element.dispatchEvent(new Event('click'))
    } else if (count % 3 === 1) {
      divEventProxy.element.dispatchEvent(new Event('focus'))
    } else {
      divEventProxy.element.dispatchEvent(new Event('input'))
    }
  }

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 1000)

  setTimeout(() => {
    for (let count = 0; count < 3; count++) {
      if (count % 3 === 0) {
        divEventProxy.element.dispatchEvent(new Event('click'))
      } else if (count % 3 === 1) {
        divEventProxy.element.dispatchEvent(new Event('focus'))
      } else {
        divEventProxy.element.dispatchEvent(new Event('input'))
      }
    }
  }, 2000)

  const reader = eventStream.getReader()
  for (let count = 0; count < 6; count++) {
    const { value: v, done } = await reader.read()

    expect(done).toBe(false)

    if (!done) {
      const { event, value } = v
      if (count % 2 === 0) {
        expect(event).toBe('focus')
        expect(value[0].type).toBe('focus')
      } else if (count % 2 === 1) {
        expect(event).toBe('input')
        expect(value[0].type).toBe('input')
      }
    }
  }
})
