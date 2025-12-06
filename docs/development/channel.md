# Channel 模块设计与使用

## 概述

`Channel` 模块旨在提供一个高性能、可控的数据传输通道，灵感来源于 TCP 的缓冲和流量控制机制。它通过双队列（stash 队列和主队列）和智能的 flush 策略，优化了高频、小批量数据的发送，有效解决了“小包问题”，并提供了简化的拥塞避免机制。

## 设计原理

1.  **双队列机制**:
    *   **Stash 队列**: 充当发送缓冲区，数据首先写入此队列。
    *   **主队列**: 存储已准备好读取的数据。
2.  **智能 Flush 策略**:
    *   **时间窗口 (Flush Time Window)**: 类似 TCP 的延迟 ACK (Delayed ACK)，在一定时间窗口内积累数据，减少不必要的 flush。
    *   **大小阈值 (Flush Size Threshold)**: 类似 TCP 的最大报文段大小 (MSS)，当数据量达到一定阈值时触发 flush。
    *   **Nagle 算法**: 通过 `enableNagleAlgorithm` 控制，延迟发送小批量数据，直到有足够的数据或确认收到。
3.  **拥塞避免**:
    *   通过 `congestionThreshold` 监控主队列使用率，当达到阈值时，减缓 flush 速率，避免雪崩效应。
    *   实现简单的退避策略，在拥塞时增加 flush 延迟。

## 配置选项 (ChannelConfig)

| 选项名称               | 类型      | 默认值 | 描述                                       |
| :--------------------- | :-------- | :----- | :----------------------------------------- |
| `flushTimeWindow`      | `number`  | 40     | 自动 flush 的时间窗口 (ms)，类似 TCP 的 delayed ACK。 |
| `flushSizeThreshold`   | `number`  | 10     | 自动 flush 的大小阈值，类似 TCP 的 MSS。    |
| `enableNagleAlgorithm` | `boolean` | `true` | 启用类 Nagle 算法，延迟发送小批量数据。      |
| `congestionThreshold`  | `number`  | 0.8    | 拥塞避免阈值，主队列使用率超过此值时减缓 flush。 |
| `minFlushDelay`        | `number`  | 5      | 最小 flush 延迟 (ms)，防止频繁 flush。     |

## 使用示例

```typescript
import { Channel } from 'ocev/containers/channel';

async function main() {
  const channel = new Channel<string>({
    flushTimeWindow: 50,
    flushSizeThreshold: 5,
    enableNagleAlgorithm: true,
  });

  // 写入数据
  await channel.write('hello');
  await channel.write('world', '!');

  // 手动强制 flush (类似 TCP_NODELAY)
  await channel.flush();

  // 从主队列读取数据
  const data1 = await channel.read(); // { value: 'hello', success: true }
  const data2 = channel.tryRead();    // { value: 'world', success: true }

  console.log(data1, data2);

  // 获取统计信息
  const stats = channel.getStats();
  console.log('Channel Stats:', stats);

  // 关闭 Channel
  await channel.close();
}

main();
```

## 统计信息 (ChannelStats)

`getStats()` 方法返回当前 Channel 的运行统计信息，包括：

*   `stashSize`: stash 队列当前大小。
*   `mainSize`: 主队列当前大小。
*   `totalWrites`: 总写入次数。
*   `totalFlushes`: 总 flush 次数。
*   `autoFlushes`: 自动 flush 次数。
*   `manualFlushes`: 手动 flush 次数。
*   `congestionDelays`: 因拥塞延迟的 flush 次数。
*   `avgFlushDelay`: 平均 flush 延迟 (ms)。

## 最佳实践

*   **调整参数**: 根据实际应用场景（数据量、发送频率、实时性要求），调整 `flushTimeWindow` 和 `flushSizeThreshold` 以平衡延迟和吞吐量。
*   **手动 Flush**: 对于需要低延迟的实时数据，可以使用 `flush()` 方法强制立即发送。
*   **拥塞监控**: 关注 `congestionDelays` 统计，如果该值持续升高，可能表明系统存在瓶颈，需要调整发送策略或后端处理能力。
