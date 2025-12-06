# WebSocketClient 模块设计与使用

## 概述

`WebSocketClient` 模块提供了一个健壮、易用的 WebSocket 客户端封装，集成了连接管理、自动重连、心跳机制和状态管理。它基于 `ocev` 的事件系统，将 WebSocket 的原生事件转换为可订阅的事件流，极大地简化了 WebSocket 的使用和错误处理。

## 核心功能

1.  **连接管理**: 封装了 WebSocket 的连接、断开逻辑。
2.  **自动重连 (ReconnectManager)**:
    *   在连接断开时，按照可配置的策略自动尝试重连。
    *   支持指数退避等重连间隔策略。
3.  **心跳机制 (HeartbeatManager)**:
    *   **客户端心跳**: 定期向服务器发送心跳消息，维持连接活跃。
    *   **服务器心跳响应检测**: 监测服务器是否按时响应心跳，如果超时则认为连接异常，触发重连。
4.  **状态管理 (StateManager)**:
    *   维护 WebSocket 连接的当前状态（如 `CONNECTING`, `OPEN`, `CLOSING`, `CLOSED`, `RECONNECTING`）。
    *   提供状态查询接口，方便上层应用根据连接状态进行逻辑判断。
5.  **事件订阅**: 将 WebSocket 的 `open`, `close`, `message` 事件通过 `ocev.SyncEvent` 暴露为可订阅的事件。
6.  **消息发送 (Sender)**: 提供了统一的消息发送接口，确保消息在连接可用时发送。

## 配置选项 (WebSocketClientOptions)

| 选项名称                       | 类型     | 默认值 | 描述                                       |
| :----------------------------- | :------- | :----- | :----------------------------------------- |
| `reconnectManagerOptions.baseReconnectInterval` | `number` | -      | 自动重连的基础间隔时间 (ms)。              |
| `heartbeatManagerOptions.clientHeartbeatInterval` | `number` | -      | 客户端发送心跳的间隔时间 (ms)。            |
| `heartbeatManagerOptions.serverMaxHeartbeatResponseTime` | `number` | -      | 服务器最大心跳响应时间 (ms)，超时则认为连接断开。 |
| `heartbeatManagerOptions.checkHeartbeatInterval` | `number` | -      | 检查服务器心跳响应的间隔时间 (ms)。      |

## 使用示例

```typescript
import { WebSocketClient } from 'ocev/containers/websocket';
import { Connection } from 'ocev/containers/websocket/connection'; // 假设Connection是你的WebSocket实现

async function createAndMaintainWebSocket() {
  // 假设你有一个实现了 IConnection 接口的 WebSocket 连接类
  const connection = new Connection('ws://localhost:8080');

  const client = new WebSocketClient<string>(connection, {
    reconnectManagerOptions: {
      baseReconnectInterval: 1000, // 1秒基础重连间隔
    },
    heartbeatManagerOptions: {
      clientHeartbeatInterval: 5000, // 每5秒发送一次心跳
      serverMaxHeartbeatResponseTime: 3000, // 服务器3秒内无响应则认为断开
      checkHeartbeatInterval: 1000, // 每秒检查心跳
    },
  });

  // 订阅事件
  client.subscriber.on('open', () => {
    console.log('WebSocket Connected!');
    client.send('Hello Server!');
  });

  client.subscriber.on('message', (data) => {
    console.log('Received message:', data);
  });

  client.subscriber.on('close', () => {
    console.log('WebSocket Disconnected!');
  });

  // 启动连接维护（包括自动重连和心跳）
  await client.maintain();

  // 模拟断开连接 (例如，在一段时间后)
  // setTimeout(() => {
  //   client.disconnect();
  // }, 30000);
}

createAndMaintainWebSocket();
```

## 订阅器 (Subscriber)

`WebSocketClient` 通过 `subscriber` 属性暴露其事件订阅接口，支持以下事件：

*   `open`: 连接成功建立时触发。
*   `close`: 连接断开时触发。
*   `message`: 接收到消息时触发，消息内容作为参数传入。

你可以使用 `client.subscriber.on('event', handler)` 来监听这些事件。

## 消息发送

使用 `client.send(data)` 方法发送数据。该方法会等待连接处于可用状态后发送消息，确保消息的可靠性。

## 连接生命周期

*   **`maintain()`**: 启动 WebSocket 客户端的连接维护，包括初始连接、自动重连和心跳机制。这是一个异步方法，会一直运行直到调用 `disconnect()`。
*   **`disconnect()`**: 断开 WebSocket 连接，并清理所有相关的资源（重连管理器、心跳管理器和事件监听器）。

## 扩展性

`WebSocketClient` 接受一个实现 `IConnection` 接口的连接对象。这意味着你可以轻松地替换底层的 WebSocket 实现（例如，使用不同的 WebSocket 库或模拟连接进行测试），而无需修改 `WebSocketClient` 的核心逻辑。
