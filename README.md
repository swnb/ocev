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

ocev is an event library designed to **simplify** the complexity of event processing. while supporting **promise/stream** to handle events.

supporting **all events** of proxy web elements, and processing with ocev api.

all api are maximized support typescript, providing the most complete type prompt

<p align="center"><a href="https://ocev.async-rustacean.top/docs/introduction/">English Docs</a> | <a href="https://ocev.async-rustacean.top/zh-Hans/docs/introduction/">📑中文</a></p>

## Install

```shell
npm install ocev
# or
yarn add ocev
# or
pnpm i ocev
```

## Basic Usage

```typescript
import { SyncEvent } from "ocev"

// define event type
type EventHandlerMap = {
  event1: (arg1: string, arg2: number) => void
  event2: (arg1: number, arg2: string) => void
}

const syncEvent = SyncEvent.new<EventHandlerMap>()

queueMicrotask(() => {
  syncEvent.emit("event1", "1", 2)
  syncEvent.emit("event2", 3, "4")
})

// register
const cancel = syncEvent
  .on("event1", (arg1, arg2) => {})
  .once("event2", (arg1, arg2) => {})
  .on("event1", (arg1, arg2) => {}, {
    debounce: {
      waitMs: 200,
      maxWaitMs: 500,
    },
  })

// cancel()

// waitUtil event emit
await syncEvent.waitUtil("event1")

// create event stream
const eventStream = syncEvent.createEventStream(["event1", "event2"])
```

## What can ocev do

From the above example, you can see that ocev is essentially a **(pub/sub) library**, but ocev can also **proxy all events of** web element, and use ocev to handle all events with **promise/stream**.

> ocev has two class,[SyncEvent](https://ocev.async-rustacean.top/docs/sync-event),[EventProxy](https://ocev.async-rustacean.top/docs/event-proxy), the following example is mainly based on **EventProxy**

#### 1. Simplified Web Event Handling

I've always felt that web event handling is too complex, and if you're using react, you're probably going to write this code. I have written a lot of template code like this, it is very complicated

```tsx example.tsx
useEffect(() => {
  const callback = () => {}

  target.addEventListener("event", callback) // any event target

  return () => {
    target.removeEventListener("event", callback)
  }
}, [target])
```

for multiple events

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

If you are using ocev, your code will be something like this, **infinite calls, one-time cleanup**

```tsx
import { EventProxy } from "ocev"

useEffect(() => {
  return EventProxy.new(target)
    .on("event1", (...args) => {}) // type hint!
    .once("event2", (...args) => {})
    .on("event3", (...args) => {})
}, [target])
```

ocev's method `on/once` returns a clean function, which can be called `once,on` as an object. For more details, please see the [documentation](https://ocev.async-rustacean.top/docs/sync-event#on).


> all examples in current section base on **EventProxy**, **EventProxy** is wrapper of SyncEvent, more detail see [documentation](https://ocev.async-rustacean.top/docs/sync-event).

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
  //  Wait for the 'open' event to trigger or timeout throws an exception
  await EventProxy.new(ws).waitUtil("open", { timeout })
  //  or Race waits for either an 'open' event or an 'error' to trigger first see docs
  //  await EventProxy.new(ws).waitUtilRace([
  //     { event: "open", timeout },
  //     { event: "error",
  //       mapToError: () => new Error("websocket connect error"),
  //     },
  //   ])

  return ws
}
```

**Promise** makes event handling simple and elegant, and using Promise to process code makes logic clearer

Take it a step further and see how to implement message processing (**Stream**) with ocev

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
        // support type prompt
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

With asyncIterator, you can convert events into stream, and you can use the [**strategy**](https://ocev.async-rustacean.top/docs/sync-event#back-pressure) to drop messages when faced with **backpressure**

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

  const url = "" // your  video  link

  return <video muted autoPlay src={url} ref={videoDomRef} />
}
```

open the console and you will see the order of all the 'video' events

![](./docs/img1.png)

Almost all **web elements** can be proxied by `EventProxy`. [codesandbox example](https://codesandbox.io/p/sandbox/eventproxy-yxhm2h?layout=%257B%2522sidebarPanel%2522%253A%2522EXPLORER%2522%252C%2522rootPanelGroup%2522%253A%257B%2522direction%2522%253A%2522horizontal%2522%252C%2522contentType%2522%253A%2522UNKNOWN%2522%252C%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522id%2522%253A%2522ROOT_LAYOUT%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522UNKNOWN%2522%252C%2522direction%2522%253A%2522vertical%2522%252C%2522id%2522%253A%2522clswz8fwr00063b6fas7jbmut%2522%252C%2522sizes%2522%253A%255B100%252C0%255D%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522EDITOR%2522%252C%2522direction%2522%253A%2522horizontal%2522%252C%2522id%2522%253A%2522EDITOR%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL%2522%252C%2522contentType%2522%253A%2522EDITOR%2522%252C%2522id%2522%253A%2522clswz8fwq00023b6fm2cmwxo5%2522%257D%255D%257D%252C%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522SHELLS%2522%252C%2522direction%2522%253A%2522horizontal%2522%252C%2522id%2522%253A%2522SHELLS%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL%2522%252C%2522contentType%2522%253A%2522SHELLS%2522%252C%2522id%2522%253A%2522clswz8fwq00033b6fhl8pam9h%2522%257D%255D%252C%2522sizes%2522%253A%255B100%255D%257D%255D%257D%252C%257B%2522type%2522%253A%2522PANEL_GROUP%2522%252C%2522contentType%2522%253A%2522DEVTOOLS%2522%252C%2522direction%2522%253A%2522vertical%2522%252C%2522id%2522%253A%2522DEVTOOLS%2522%252C%2522panels%2522%253A%255B%257B%2522type%2522%253A%2522PANEL%2522%252C%2522contentType%2522%253A%2522DEVTOOLS%2522%252C%2522id%2522%253A%2522clswz8fwq00053b6fg2v9cieb%2522%257D%255D%252C%2522sizes%2522%253A%255B100%255D%257D%255D%252C%2522sizes%2522%253A%255B40%252C60%255D%257D%252C%2522tabbedPanels%2522%253A%257B%2522clswz8fwq00023b6fm2cmwxo5%2522%253A%257B%2522id%2522%253A%2522clswz8fwq00023b6fm2cmwxo5%2522%252C%2522tabs%2522%253A%255B%257B%2522id%2522%253A%2522clsx27rea00023b6fu2nv4xf9%2522%252C%2522mode%2522%253A%2522permanent%2522%252C%2522type%2522%253A%2522FILE%2522%252C%2522initialSelections%2522%253A%255B%257B%2522startLineNumber%2522%253A16%252C%2522startColumn%2522%253A17%252C%2522endLineNumber%2522%253A16%252C%2522endColumn%2522%253A17%257D%255D%252C%2522filepath%2522%253A%2522%252Fsrc%252FApp.tsx%2522%252C%2522state%2522%253A%2522IDLE%2522%257D%255D%252C%2522activeTabId%2522%253A%2522clsx27rea00023b6fu2nv4xf9%2522%257D%252C%2522clswz8fwq00053b6fg2v9cieb%2522%253A%257B%2522tabs%2522%253A%255B%257B%2522id%2522%253A%2522clswz8fwq00043b6fme2k6wxm%2522%252C%2522mode%2522%253A%2522permanent%2522%252C%2522type%2522%253A%2522UNASSIGNED_PORT%2522%252C%2522port%2522%253A0%252C%2522path%2522%253A%2522%252F%2522%257D%255D%252C%2522id%2522%253A%2522clswz8fwq00053b6fg2v9cieb%2522%252C%2522activeTabId%2522%253A%2522clswz8fwq00043b6fme2k6wxm%2522%257D%252C%2522clswz8fwq00033b6fhl8pam9h%2522%253A%257B%2522tabs%2522%253A%255B%255D%252C%2522id%2522%253A%2522clswz8fwq00033b6fhl8pam9h%2522%257D%257D%252C%2522showDevtools%2522%253Atrue%252C%2522showShells%2522%253Afalse%252C%2522showSidebar%2522%253Atrue%252C%2522sidebarPanelSize%2522%253A16.024883029999998%257D)

## More

If you want to know more about **EventProxy** and **SyncEvent**, see [docs](https://ocev.async-rustacean.top/docs/sync-event)
