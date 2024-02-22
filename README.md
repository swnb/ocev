<p align='center'><img style="width:220px;" src="./logo.svg"/></p>

<h1></h1>

![Jest coverage](./badges/coverage-jest%20coverage.svg)
![github workflow](https://github.com/swnb/ocev/actions/workflows/test.yml/badge.svg)
![typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label)
![license](https://img.shields.io/badge/license-MIT-blue.svg)
[![npm](https://img.shields.io/npm/v/ocev)](https://www.npmjs.com/package/ocev)

<p align='center'> event library with promise/stream support</p>
<p align='center'> proxy all web element event</p>


## What is ocev

ocev is an event library designed to simplify the complexity of event processing, while supporting promise/stream mode to handle events, supporting all events of proxy web elements, and processing with ocev api, all api are maximized support typescript, providing the most complete type prompt

## Install

```shell
npm install ocev
# or
yarn add ocev
# or
pnpm i ocev
```

## What can ocev do

#### 1. Simplified Web Event Handling

I've always felt that web event handling is too complex, and if you're using react, you're probably going to write this code.

```tsx example.tsx
useEffect(() => {
  const callback = () => {}

  target.addEventListener("event", callback)

  return () => {
    target.removeEventListener("event", callback)
  }
}, [target])
```

multiple events.

```tsx example.tsx
useEffect(() => {
  const callback1 = () => {}
  target.addEventListener("event1", callback1)

  const callback2 = () => {}
  target.addEventListener("event2", callback2)
  // ....
  return () => {
    target.removeEventListener("event1", callback1)
    target.removeEventListener("event2", callback2)
    // ....
  }
}, [target])
```

You have to clean up as many as you register, which is very cumbersome to write.

If you are using ocev, your code will be something like this, infinite calls, one-time cleanup

```tsx
import { EventProxy } from "ocev"

useEffect(
  () =>
    EventProxy.new(target)
      .on("event1", (...args) => {}) // 支持完整的类型提示
      .once("event2", (...args) => {})
      .on("event3", (...args) => {}),
  [target]
)
```

> all examples in current section base on EventProxy, EventProxy is wrapper of SyncEvent, more detail see docs

#### 2. Promise/Stream

Consider a scenario where you want to establish a websocket connection, wait for the connection to open, set the maximum wait time for the connection, and then handle messages and exceptions. To ensure **the correct release of resources**, you might write the following code

```typescript showLineNumbers
async function setupWebSocket(
  url: string,
  successCallback: (ws: WebSocket) => void,
  errorCallback: (err: Error) => void,
  timeout: number
) {
  const ws = new WebSocket(url)

  const timeID = setTimeout(() => {
    errorCallback(new Error("timeout"))
    ws.removeEventListener("open", onOpen)
    ws.removeEventListener("error", onError)
  }, timeout)

  function onOpen() {
    successCallback(ws)
    clearTimeout(timeID)
  }

  function onError() {
    errorCallback(new Error("can't connect to server"))
    clearTimeout(timeID)
  }

  ws.addEventListener("open", onOpen)
  ws.addEventListener("error", onError)
}

```

ocev supports Promise to handle events. If you use ocev to handle events, the code will be like this

```typescript websocket.ts
 import { EventProxy } from "ocev"

async function setupWebSocket(url: string, timeout: number) {
  const ws = new WebSocket(url)
  // 等待 open 事件触发或者 timeout 抛出异常
  await EventProxy.new(ws).waitUtil("open", { timeout })
  // 或下面的写法
  //  await EventProxy.new(ws).waitUtilRace([
  //     { event: "open", timeout },
  //     { event: "error",
  //       mapToError: () => new Error("websocket connect error"),
  //     },
  //   ])

  return ws
}
```

Promise makes event handling simple and elegant, and using Promise to process code makes logic clearer

Take it a step further and see how to implement message processing (Stream) with ocev

```typescript
import { EventProxy } from "ocev"

async function setupWebSocket(url: string, timeout: number) {
  const ws = EventProxy.new(new WebSocket(url))

  await ws.waitUtilRace([
    { event: "open", timeout },
    {
      event: "error",
      mapToError: () => new Error("websocket connect error"),
    },
  ])

  // convert to Event Stream
  const eventStream = ws.createEventStream(["close", "message", "error"])
  // another way(ReadableStream)
  // const readableStream = ws.createEventReadableStream(["close", "message", "error"])

  // all events are pushed into a queue
  for await (const { event, value } of eventStream) {
    switch (event) {
      case "error": {
        throw Error("websocket connect error")
      }
      case "close": {
        throw Error("websocket connection closed")
      }
      case "message": {
        // 支持类型提示
        const message = value[0].data
        // handle message
        break
      }
      default:
        throw new Error("unreachable")
    }
  }
}
```

With asyncIterator, you can convert events into stream, and you can use the **strategy** to drop messages when faced with backpressure

With Promise/Stream, when you convert all the code to async/await, you can handle the reconnection logic like this

```typescript
let reconnectCount = 0
for (;;) {
  try {
    await setupWebSocket("", 1000)
  } catch (error) {
    reconnectCount += 1
  }
}
```

If you want to establish a WebRTC connection, you can use `where`

```typescript
import { EventProxy } from "ocev"

async function connect(timeout: number) {
  const connection = new RTCPeerConnection()

  await EventProxy.new(connection).waitUtil("connectionstatechange", {
    timeout,
    // resolve when where return true
    where: (ev) => connection.connectionState === "connected",
  })

  return connection
}
```

#### Observe all the events of a **web** object

Do you know what events video triggers when it plays?

```typescript showLineNumbers
import { EventProxy } from "ocev"
// 或者  EventProxy.new(videoDom).proxyAllEvent()
EventProxy.new(videoDom, { proxyAllEvent: true }).any((eventName, ...args) => {
  console.log(eventName)
})
```

real example in `react`

```tsx video.tsx
import { EventProxy } from "ocev"
import { useEffect, useRef } from "react"

function Video() {
  const videoDomRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    return EventProxy.new(videoDomRef.current!, { proxyAllEvent: true }).any((eventName, ...args) => {
      console.log(eventName)
    })
  }, [])

  const url = "" // 你的  video  链接

  return <video muted autoPlay src={url} ref={videoDomRef} />
}
```

open the console and you will see the order of all the 'video' events

![](./docs/img1.png)


## More

If you want to know more about **EventProxy** and **SyncEvent**, see docs
