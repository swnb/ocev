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

function createProxy<T extends keyof HTMLElementTagNameMap>(tag: T) {
  return EventProxy.new(document.createElement(tag))
}

test.concurrent('test sync event listenerCount', () => {
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

test.concurrent('test sync event on and once', () => {
  const eventEmitter = SyncEvent.new<EventHandlerMap>()
  let count = 0
  const cancelAll = eventEmitter.subscriber
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

  eventEmitter.publisher.emit('ev2', 1, '')

  expect(count).toBe(1)

  eventEmitter.emit('ev1', '', 1)

  expect(count).toBe(2)

  cancelAll()

  eventEmitter.emit('ev1', '', 1)

  expect(count).toBe(2)

  eventEmitter.subscriber.on('ev1', (_, v) => {
    count += v
  })

  eventEmitter.subscriber.offAll()

  eventEmitter.emit('ev1', '', 1)

  expect(count).toBe(2)
})

test.concurrent('test event proxy', () => {
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

test.concurrent('test any event proxy', () => {
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

test.concurrent('test sync event waitUtil', async () => {
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

  const p = divEventProxyAgent
    .waitUtil('click', {
      mapToError: () => error,
      timeout: 500,
    })
    .catch(e => {
      expect(error).toBe(e)
    })

  div.click()

  await p
})

test.concurrent('test sync event bind for global', async () => {
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

test.concurrent('test cancel listener', async () => {
  const sectionEventProxy = createProxy('section')
  let emitCount = 0

  sectionEventProxy.proxyAllEvent()

  const cancel = sectionEventProxy.any((event, ..._args) => {
    expect(event).toBe('click')
    emitCount += 1
  })

  sectionEventProxy.element.dispatchEvent(new Event('click'))

  await new Promise(res => {
    setTimeout(res, 1000)
  })

  expect(sectionEventProxy.listenerCount()).toBe(1)

  cancel()

  sectionEventProxy.element.dispatchEvent(new Event('click'))

  expect(emitCount).toBe(1)
  expect(sectionEventProxy.listenerCount()).toBe(0)

  sectionEventProxy
    .on('click', () => {
      emitCount += 1
    })
    .on('click', () => {
      emitCount += 1
    })
    .on('drop', () => {
      emitCount += 1
    })

  sectionEventProxy.element.dispatchEvent(new Event('click'))

  expect(sectionEventProxy.listenerCount()).toBe(3)
  expect(sectionEventProxy.listenerCount('click')).toBe(2)
  expect(sectionEventProxy.listenerCount('drop')).toBe(1)

  expect(emitCount).toBe(3)

  sectionEventProxy.offAll('click')

  sectionEventProxy.element.dispatchEvent(new Event('click'))
  expect(emitCount).toBe(3)
  sectionEventProxy.element.dispatchEvent(new Event('drop'))
  expect(emitCount).toBe(4)

  expect(sectionEventProxy.listenerCount()).toBe(1)
  expect(sectionEventProxy.listenerCount('click')).toBe(0)
  expect(sectionEventProxy.listenerCount('drop')).toBe(1)

  sectionEventProxy.on('drag', () => {
    emitCount += 1
  })

  sectionEventProxy.element.dispatchEvent(new Event('drag'))
  expect(emitCount).toBe(5)
  expect(sectionEventProxy.listenerCount()).toBe(2)
  expect(sectionEventProxy.listenerCount('click')).toBe(0)
  expect(sectionEventProxy.listenerCount('drop')).toBe(1)

  sectionEventProxy.offAll()
  sectionEventProxy.element.dispatchEvent(new Event('drag'))
  sectionEventProxy.element.dispatchEvent(new Event('click'))
  sectionEventProxy.element.dispatchEvent(new Event('drag'))

  expect(emitCount).toBe(5)

  expect(sectionEventProxy.listenerCount()).toBe(0)
  expect(sectionEventProxy.listenerCount('click')).toBe(0)
  expect(sectionEventProxy.listenerCount('drop')).toBe(0)
  expect(sectionEventProxy.listenerCount('drag')).toBe(0)
})

test.concurrent('test waitUtilAll', async () => {
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

  const error = new Error('click happened')

  const p = globalEventProxyAgent
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

  await p
})

test.concurrent('test waitUtilRace', async () => {
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

test.concurrent('test waitUtilAny', async () => {
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

  const p = globalEventProxyAgent
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

  await p
})

test.concurrent(
  'test eventStream',
  async () => {
    const div = document.createElement('div')
    const divEventProxyAgent = EventProxy.new(div)

    const clickStream = divEventProxyAgent.createEventStream(['click'])
    const maxExecTime = 10

    for (let i = 0; i < maxExecTime; i++) {
      div.dispatchEvent(new Event('click'))
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
      div.dispatchEvent(new Event('click'))
    }, 500)

    count = 0
    const time = Date.now()
    // eslint-disable-next-line no-restricted-syntax
    for await (const { event, value } of divEventProxyAgent.createEventStream(['click'])) {
      expect(event).toBe('click')
      expect(value[0].type).toBe('click')
      expect(Date.now() - time).toBeGreaterThan(count * 500)
      count += 1
      if (count === 3) {
        break
      }
    }
  },
  10000,
)

test.concurrent(
  'test eventStream multi event',
  async () => {
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
        break
      }
    }

    expect(eventStream.droppedEventCount()).toBe(0)
    expect(eventStream.replacedEventCount()).toBe(0)
  },
  7000,
)

test.concurrent('test eventStream strategy drop', async () => {
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
      break
    }
  }

  expect(eventStream.droppedEventCount()).toBe(3)
  expect(eventStream.replacedEventCount()).toBe(0)
})

test.concurrent('test eventStream strategy replace', async () => {
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
      break
    }
  }

  expect(eventStream.droppedEventCount()).toBe(0)
  expect(eventStream.replacedEventCount()).toBe(3)
})

test.concurrent(
  'test eventReadableStream multi event',
  async () => {
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
  },
  7000,
)

test.concurrent(
  'test eventReadableStream cancel',
  async () => {
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
  },
  7000,
)

test.concurrent('test eventReadableStream strategy drop', async () => {
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

test.concurrent('test eventReadableStream strategy replace', async () => {
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

test('test listener options debounce', done => {
  const fn = async () => {
    const div = document.createElement('div')
    const divEventProxy = EventProxy.new(div)

    let emitTimes = 0
    const originTime = Date.now()
    let time = originTime
    divEventProxy.on(
      'click',
      () => {
        emitTimes += 1
        try {
          expect(time).toBeGreaterThan(originTime)
          expect(div.dataset['count']).toBe('60')

          expect(Date.now() - time).toBeGreaterThanOrEqual(500)
          expect(Date.now() - time).toBeLessThan(600)
        } catch (error) {
          done(error)
        }
      },
      {
        debounce: {
          waitMs: 500,
        },
      },
    )

    let count = 0
    let timerId = setInterval(() => {
      count += 1
      div.click()
      div.dataset['count'] = count.toString()
      time = Date.now()
      if (count === 60) {
        clearInterval(timerId)
      }
    }, 10)

    await divEventProxy.waitUtil('click', {
      where() {
        return count >= 60
      },
    })

    expect(emitTimes).toBe(0)

    await new Promise(res => {
      setTimeout(res, 1000)
    })

    expect(emitTimes).toBe(1)

    count = 0
    timerId = setInterval(() => {
      count += 1
      div.click()
      div.dataset['count'] = count.toString()
      time = Date.now()
      if (count === 60) {
        clearInterval(timerId)
      }
    }, 10)

    await divEventProxy.waitUtil('click', {
      where() {
        return count >= 59
      },
    })

    expect(emitTimes).toBe(1)

    await new Promise(res => {
      setTimeout(res, 1000)
    })

    expect(emitTimes).toBe(2)
  }

  fn().then(done).catch(done)
})

test('test listener options debounce maxTime', done => {
  const fn = async () => {
    const div = document.createElement('div')
    const divEventProxy = EventProxy.new(div)

    let emitTimes = 0

    let time = Date.now()
    divEventProxy.on(
      'click',
      () => {
        emitTimes += 1
        const now = Date.now()

        try {
          expect(now - time).toBeGreaterThanOrEqual(100)
          expect(now - time).toBeLessThanOrEqual(250)
          time = now
        } catch (error) {
          done(error)
        }
      },
      {
        debounce: {
          waitMs: 100,
          maxWaitMs: 200,
        },
      },
    )

    let count = 0
    const timerId = setInterval(() => {
      count += 1
      div.click()
      div.dataset['count'] = count.toString()
      if (count === 40) {
        clearInterval(timerId)
      }
    }, 50)

    const timeMark = Date.now()
    await divEventProxy.waitUtil('click', {
      where() {
        return count >= 40
      },
    })

    expect(emitTimes).toBeGreaterThanOrEqual(Math.floor((Date.now() - timeMark) / 200))
  }

  fn().then(done).catch(done)
})

test('test listener options debounce maxTime Date', done => {
  const fn = async () => {
    const div = document.createElement('div')
    const divEventProxy = new EventProxy(div, { useDateAsTimeTool: true })

    let emitTimes = 0

    let time = Date.now()
    divEventProxy.on(
      'click',
      () => {
        emitTimes += 1
        const now = Date.now()

        try {
          expect(now - time).toBeGreaterThanOrEqual(100)
          expect(now - time).toBeLessThanOrEqual(250)
          time = now
        } catch (error) {
          done(error)
        }
      },
      {
        debounce: {
          waitMs: 100,
          maxWaitMs: 200,
        },
      },
    )

    let count = 0
    const timerId = setInterval(() => {
      count += 1
      div.click()
      div.dataset['count'] = count.toString()
      if (count === 40) {
        clearInterval(timerId)
      }
    }, 50)

    const timeMark = Date.now()
    await divEventProxy.waitUtil('click', {
      where() {
        return count >= 40
      },
    })

    expect(emitTimes).toBeGreaterThanOrEqual(Math.floor((Date.now() - timeMark) / 200))
  }

  fn().then(done).catch(done)
})

test('test listener options throttle', done => {
  const fn = async () => {
    const div = document.createElement('div')
    const divEventProxy = EventProxy.new(div)

    let emitTimes = 0
    const originTime = Date.now()
    let time = Date.now()
    divEventProxy.on(
      'click',
      () => {
        emitTimes += 1
        try {
          if (emitTimes > 1) {
            expect(Date.now() - time).toBeGreaterThan(1000)
            expect(Date.now() - time).toBeLessThan(1300)
          }
          time = Date.now()
        } catch (error) {
          done(error)
        }
      },
      {
        throttle: {
          waitMs: 1000,
        },
      },
    )

    let count = 0
    let timerId = setInterval(() => {
      count += 1
      div.click()
      div.dataset['count'] = count.toString()
      if (count === 60) {
        clearInterval(timerId)
      }
    }, 50)

    await divEventProxy.waitUtil('click', {
      where() {
        return count >= 60
      },
    })

    expect(emitTimes).toBeGreaterThanOrEqual(Math.floor((Date.now() - originTime) / 1000))
    expect(emitTimes).toBeLessThanOrEqual(Math.floor((Date.now() - originTime) / 1000) + 1)

    timerId = setInterval(() => {
      count += 1
      div.click()
      div.dataset['count'] = count.toString()
      if (count === 60) {
        clearInterval(timerId)
      }
    }, 200)
  }

  fn().then(done).catch(done)
})

test.concurrent('test params valid', async () => {
  const div = createProxy('div')
  try {
    // @ts-ignore
    div.on('__offSyncEventListener__', () => {})
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    // @ts-ignore
    div.on('__onSyncEventListener__', () => {})
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  const e = Error()
  try {
    setTimeout(() => {
      div.element.dispatchEvent(new Event('click'))
    })
    await div.waitUtil('click', {
      mapToError() {
        throw e
      },
    })
  } catch (error) {
    expect(error).toBe(e)
  }

  try {
    setTimeout(() => {
      div.element.dispatchEvent(new Event('click'))
    })
    const value = await div.waitUtil('click', {
      mapToError() {
        return null
      },
    })
    expect(value[0].type).toBe('click')
  } catch (error) {
    expect(true).toBe(false)
  }

  try {
    setTimeout(() => {
      div.element.dispatchEvent(new Event('click'))
    })
    let count = 0
    await div.waitUtil('click', {
      timeout: 1000,
      where() {
        throw e
        count += 1
        return count === 10
      },
    })

    expect(true).toBe(false)
  } catch (error) {
    expect(error).toBe(e)
  }

  try {
    div.on('click', () => {}, {
      debounce: {
        waitMs: NaN,
        maxWaitMs: 0,
      },
      throttle: {
        waitMs: 0,
      },
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.on('click', () => {}, {
      debounce: {
        waitMs: 10,
        maxWaitMs: -1,
      },
      throttle: {
        waitMs: 0,
      },
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.on('click', () => {}, {
      debounce: {
        waitMs: 10,
        maxWaitMs: 20,
      },
      throttle: {
        waitMs: NaN,
      },
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.on('click', () => {}, {
      debounce: {
        waitMs: 200,
        maxWaitMs: 100,
      },
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.createEventStream(['click'], {
      capacity: -1,
      // @ts-ignore
      strategyWhenFull: 'xxx',
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.createEventStream(['click'], {
      capacity: NaN,
      // @ts-ignore
      strategyWhenFull: 'xxx',
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.createEventStream(['click'], {
      capacity: -1,
      // @ts-ignore
      strategyWhenFull: 'xxx',
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.createEventReadableStream(['click'], {
      capacity: -1,
      // @ts-ignore
      strategyWhenFull: 'xxx',
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.createEventReadableStream(['click'], {
      capacity: NaN,
      // @ts-ignore
      strategyWhenFull: 'xxx',
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    div.createEventReadableStream(['click'], {
      capacity: -1,
      // @ts-ignore
      strategyWhenFull: 'xxx',
    })
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    // @ts-ignore
    await div.waitUtil()
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    const cancel = { current() {} }
    const p = div.waitUtil('click', { cancelRef: cancel })
    cancel.current?.()
    await p
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    const cancel = { current() {} }

    const p = div.waitUtilAll([{ event: 'click', timeout: 100, cancelRef: cancel }])
    cancel?.current?.()
    await p
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }

  try {
    await div.waitUtilAll([])
    expect(false).toBe(true)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
  }
})

test.concurrent('test event recorder', () => {
  const eventEmitter = SyncEvent.new<{
    setValue: (value: number) => void
    increase: VoidFunction
    decrease: VoidFunction
  }>()

  const eventRecorder = eventEmitter.createEventRecorder({ replaySelf: true })

  eventRecorder.record()

  let value = 0
  eventEmitter
    .on('setValue', newValue => {
      value = newValue
    })
    .on('increase', () => {
      value += 1
    })
    .on('decrease', () => {
      value -= 1
    })

  eventEmitter.emit('setValue', 1)
  expect(value).toBe(1)
  eventEmitter.emit('increase')
  expect(value).toBe(2)
  eventEmitter.emit('decrease')
  expect(value).toBe(1)

  value = 0
  eventRecorder.replay()
  expect(value).toBe(1)

  eventRecorder.stop()

  eventEmitter.emit('increase')
  expect(value).toBe(2)
  eventRecorder.replay()
  expect(value).toBe(1)
  eventEmitter.emit('increase')
  expect(value).toBe(2)
  eventRecorder.replay()
  expect(value).toBe(1)

  eventRecorder.record()
  expect(value).toBe(1)
  eventEmitter.emit('increase')
  expect(value).toBe(2)
  eventRecorder.replay()
  expect(value).toBe(2)
  eventEmitter.emit('increase')
  expect(value).toBe(3)
  eventRecorder.replay()
  expect(value).toBe(3)

  eventRecorder.clear()
  eventEmitter.emit('increase')
  expect(value).toBe(4)
  eventRecorder.replay()
  expect(value).toBe(5)

  const recorder2 = eventEmitter.createEventRecorder()

  eventEmitter.emit('setValue', 0)

  recorder2.record()
  expect(value).toBe(0)
  eventEmitter.emit('increase')
  expect(value).toBe(1)
  recorder2.replay()
  expect(value).toBe(1)

  recorder2.subscriber
    .on('increase', () => {
      value += 1
    })
    .on('decrease', () => {
      value -= 1
    })

  recorder2.replay()

  expect(value).toBe(2)
})
