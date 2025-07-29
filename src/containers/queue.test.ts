import { Queue } from './queue'

describe('Queue', () => {
  describe('构造函数和静态方法', () => {
    test.concurrent('应该使用构造函数创建队列', () => {
      const queue = new Queue<number>(5)
      expect(queue).toBeInstanceOf(Queue)
      expect(queue.capacity()).toBe(5)
      expect(queue.isEmpty).toBe(true)
      expect(queue.isFull).toBe(false)
    })

    test.concurrent('应该使用静态方法创建队列', () => {
      const queue = Queue.new<string>(3)
      expect(queue).toBeInstanceOf(Queue)
      expect(queue.capacity()).toBe(3)
    })

    test.concurrent('应该创建无限容量的队列', () => {
      const queue = Queue.new<number>(0)
      expect(queue.capacity()).toBe(Infinity)
      expect(queue.remainingCapacity()).toBe(Infinity)
      expect(queue.isFull).toBe(false)
    })

    test.concurrent('应该创建默认无限容量的队列', () => {
      const queue = Queue.new<number>()
      expect(queue.capacity()).toBe(Infinity)
      expect(queue.remainingCapacity()).toBe(Infinity)
    })
  })

  describe('基本属性', () => {
    test.concurrent('isEmpty 应该正确返回队列是否为空', async () => {
      const queue = Queue.new<number>(3)

      expect(queue.isEmpty).toBe(true)

      const pushResult = await queue.push(1)
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(1)
      expect(queue.isEmpty).toBe(false)

      const result = queue.tryRead()
      expect(result.success).toBe(true)
      expect(queue.isEmpty).toBe(true)
    })

    test.concurrent('isFull 应该正确返回队列是否已满', async () => {
      const queue = Queue.new<number>(2)

      expect(queue.isFull).toBe(false)

      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)
      expect(queue.isFull).toBe(false)

      const result2 = await queue.push(2)
      expect(result2.success).toBe(true)
      expect(result2.pushedSize).toBe(1)
      expect(queue.isFull).toBe(true)
    })

    test.concurrent('无限容量队列永远不会满', async () => {
      const queue = Queue.new<number>(0)

      for (let i = 0; i < 1000; i++) {
        const result = await queue.push(i)
        expect(result.success).toBe(true)
        expect(result.pushedSize).toBe(1)
        expect(queue.isFull).toBe(false)
      }
    })
  })

  describe('容量相关方法', () => {
    test.concurrent('capacity() 应该返回正确的容量', () => {
      const queue1 = Queue.new<number>(5)
      expect(queue1.capacity()).toBe(5)

      const queue2 = Queue.new<number>(0)
      expect(queue2.capacity()).toBe(Infinity)
    })

    test.concurrent('remainingCapacity() 应该返回正确的剩余容量', async () => {
      const queue = Queue.new<number>(3)

      expect(queue.remainingCapacity()).toBe(3)

      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)
      expect(queue.remainingCapacity()).toBe(2)

      const result2 = await queue.push(2, 3)
      expect(result2.success).toBe(true)
      expect(result2.pushedSize).toBe(2)
      expect(queue.remainingCapacity()).toBe(0)

      queue.tryRead()
      expect(queue.remainingCapacity()).toBe(1)
    })

    test.concurrent('length() 应该返回正确的队列长度', async () => {
      const queue = Queue.new<string>(5)

      expect(queue.length()).toBe(0)

      const result1 = await queue.push('a')
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)
      expect(queue.length()).toBe(1)

      const result2 = await queue.push('b', 'c')
      expect(result2.success).toBe(true)
      expect(result2.pushedSize).toBe(2)
      expect(queue.length()).toBe(3)

      queue.tryRead()
      expect(queue.length()).toBe(2)
    })
  })

  describe('同步操作 tryPush 和 tryRead', () => {
    test.concurrent('tryPush 应该在队列未满时成功', async () => {
      const queue = Queue.new<number>(2)

      const success1 = await queue.tryPush(1)
      expect(success1).toBe(true)
      expect(queue.length()).toBe(1)

      const success2 = await queue.tryPush(2)
      expect(success2).toBe(true)
      expect(queue.length()).toBe(2)
    })

    test.concurrent('tryPush 应该在队列已满时失败', async () => {
      const queue = Queue.new<number>(1)

      await queue.tryPush(1)
      const success = await queue.tryPush(2)
      expect(success).toBe(false)
      expect(queue.length()).toBe(1)
    })

    test.concurrent('tryPush 应该能推入多个元素', async () => {
      const queue = Queue.new<number>(5)

      const success = await queue.tryPush(1, 2, 3)
      expect(success).toBe(true)
      expect(queue.length()).toBe(3)
    })

    test.concurrent('tryPush 应该正确检查推入多个元素后的容量限制', async () => {
      const queue = Queue.new<number>(3)

      // 先推入2个元素
      await queue.tryPush(1, 2)
      expect(queue.length()).toBe(2)

      // 尝试推入2个元素，应该失败（因为2+2=4 > 3）
      const success = await queue.tryPush(3, 4)
      expect(success).toBe(false)
      expect(queue.length()).toBe(2) // 队列应该保持原状

      // 推入1个元素应该成功
      const success2 = await queue.tryPush(3)
      expect(success2).toBe(true)
      expect(queue.length()).toBe(3)
    })

    test.concurrent('push 应该逐个推入多个元素', async () => {
      const queue = Queue.new<number>(3)

      // 先填入2个元素
      const result1 = await queue.push(1, 2)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(2)
      expect(queue.length()).toBe(2)

      // 在另一个任务中尝试推入2个元素（需要等待空间）
      const pushPromise = queue.push(3, 4)

      // 稍等一下确保push开始等待
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 10)
      })

      // 消费1个元素，这会让第一个待推入的元素进入队列
      const readResult = await queue.read()
      expect(readResult.value).toBe(1)

      // 稍等让第一个元素推入
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), 10)
      })

      // 现在队列应该有3个元素：2, 3，第二个元素4还在等待
      expect(queue.length()).toBe(3)

      // 再消费一个元素，让第二个元素也能推入
      const readResult2 = await queue.read()
      expect(readResult2.value).toBe(2)

      // push应该完成
      const pushResult = await pushPromise
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(2)
      expect(queue.length()).toBe(2) // 应该有2个元素：3, 4
    })

    test.concurrent('tryRead 应该在队列非空时返回元素', async () => {
      const queue = Queue.new<string>(3)

      const pushResult = await queue.push('hello')
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(1)

      const result = queue.tryRead()
      expect(result.success).toBe(true)
      expect(result.value).toBe('hello')
      expect(queue.length()).toBe(0)
    })

    test.concurrent('tryRead 应该在队列为空时失败', () => {
      const queue = Queue.new<number>(3)

      const result = queue.tryRead()
      expect(result.success).toBe(false)
      expect(result.value).toBeUndefined()
    })
  })

  describe('异步操作 push 和 read', () => {
    test.concurrent('push 应该成功推入元素并返回正确的推入数量', async () => {
      const queue = Queue.new<number>(3)

      const result = await queue.push(1, 2)
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(2)
      expect(queue.length()).toBe(2)
    })

    test.concurrent('push 单个元素应该返回 pushedSize 为 1', async () => {
      const queue = Queue.new<number>(3)

      const result = await queue.push(42)
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(1)
      expect(queue.length()).toBe(1)
    })

    test.concurrent('push 应该成功推入元素', async () => {
      const queue = Queue.new<number>(3)

      const result = await queue.push(1, 2)
      expect(result.success).toBe(true)
      expect(queue.length()).toBe(2)
    })

    test.concurrent('read 应该成功读取元素', async () => {
      const queue = Queue.new<string>(3)

      const pushResult = await queue.push('test')
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(1)

      const result = await queue.read()
      expect(result.success).toBe(true)
      expect(result.value).toBe('test')
    })

    test.concurrent('push 应该在队列满时等待消费', async () => {
      const queue = Queue.new<number>(2)

      // 填满队列
      const result1 = await queue.push(1, 2)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(2)
      expect(queue.isFull).toBe(true)

      // 开始异步推入，应该会等待
      const pushPromise = queue.push(3)

      // 稍等片刻确保push在等待
      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 消费一个元素
      const readResult = await queue.read()
      expect(readResult.value).toBe(1)

      // push 应该完成
      const pushResult = await pushPromise
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(1)
      expect(queue.length()).toBe(2)
    })

    test.concurrent('read 应该在队列空时等待生产', async () => {
      const queue = Queue.new<string>(3)

      // 开始异步读取，应该会等待
      const readPromise = queue.read()

      // 稍等片刻确保read在等待
      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 推入一个元素
      const pushResult = await queue.push('hello')
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(1)

      // read 应该完成
      const readResult = await readPromise
      expect(readResult.success).toBe(true)
      expect(readResult.value).toBe('hello')
    })

    test.concurrent('多个push等待时应该按顺序处理', async () => {
      const queue = Queue.new<number>(1)

      // 填满队列
      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)

      // 启动多个push操作
      const push1 = queue.push(2)
      const push2 = queue.push(3)

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 逐个消费
      expect((await queue.read()).value).toBe(1)
      const push1Result = await push1
      expect(push1Result.success).toBe(true)
      expect(push1Result.pushedSize).toBe(1)

      expect((await queue.read()).value).toBe(2)
      const push2Result = await push2
      expect(push2Result.success).toBe(true)
      expect(push2Result.pushedSize).toBe(1)

      expect((await queue.read()).value).toBe(3)
    })

    test.concurrent('多个read等待时应该按顺序处理', async () => {
      const queue = Queue.new<string>(3)

      // 启动多个read操作
      const read1 = queue.read()
      const read2 = queue.read()

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 逐个生产
      const pushResult1 = await queue.push('first')
      expect(pushResult1.success).toBe(true)
      expect(pushResult1.pushedSize).toBe(1)
      expect((await read1).value).toBe('first')

      const pushResult2 = await queue.push('second')
      expect(pushResult2.success).toBe(true)
      expect(pushResult2.pushedSize).toBe(1)
      expect((await read2).value).toBe('second')
    })
  })

  describe('队列关闭功能', () => {
    test.concurrent('close 应该关闭队列并清空内容', async () => {
      const queue = Queue.new<number>(3)

      const pushResult = await queue.push(1, 2, 3)
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(3)
      expect(queue.length()).toBe(3)

      await queue.close()
      expect(queue.length()).toBe(0)
    })

    test.concurrent('关闭后 push 应该返回失败且 pushedSize 为 0', async () => {
      const queue = Queue.new<number>(3)

      await queue.close()

      const result = await queue.push(1)
      expect(result.success).toBe(false)
      expect(result.pushedSize).toBe(0)
    })

    test.concurrent('关闭后 read 应该返回失败', async () => {
      const queue = Queue.new<number>(3)

      await queue.close()

      const result = await queue.read()
      expect(result.success).toBe(false)
      expect(result.value).toBeUndefined()
    })

    test.concurrent('关闭应该唤醒等待的 push 操作', async () => {
      const queue = Queue.new<number>(1)

      // 填满队列
      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)

      // 启动等待的push
      const pushPromise = queue.push(2)

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 关闭队列
      await queue.close()

      // push应该返回失败
      const result = await pushPromise
      expect(result.success).toBe(false)
      expect(result.pushedSize).toBe(0)
    })

    test.concurrent('关闭应该唤醒等待的 read 操作', async () => {
      const queue = Queue.new<number>(3)

      // 启动等待的read
      const readPromise = queue.read()

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 关闭队列
      await queue.close()

      // read应该返回失败
      const result = await readPromise
      expect(result.success).toBe(false)
    })
  })

  describe('队列重置功能', () => {
    test.concurrent('reset 应该重置队列到初始状态', async () => {
      const queue = Queue.new<number>(3)

      const pushResult = await queue.push(1, 2, 3)
      expect(pushResult.success).toBe(true)
      expect(pushResult.pushedSize).toBe(3)
      expect(queue.length()).toBe(3)

      await queue.reset()
      expect(queue.length()).toBe(0)
      expect(queue.isEmpty).toBe(true)
      expect(queue.isFull).toBe(false)
    })

    test.concurrent('reset 关闭的队列应该重新可用', async () => {
      const queue = Queue.new<number>(3)

      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)
      await queue.close()

      // 关闭后操作失败
      const result2 = await queue.push(2)
      expect(result2.success).toBe(false)
      expect(result2.pushedSize).toBe(0)

      // reset 后应该可以重新使用
      await queue.reset()
      const result3 = await queue.push(2)
      expect(result3.success).toBe(true)
      expect(result3.pushedSize).toBe(1)
      expect(queue.length()).toBe(1)

      const readResult = await queue.read()
      expect(readResult.success).toBe(true)
      expect(readResult.value).toBe(2)
    })

    test.concurrent('reset 应该中断等待的 push 操作', async () => {
      const queue = Queue.new<number>(1)

      // 填满队列
      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)

      // 启动等待的push
      const pushPromise = queue.push(2)

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 重置队列
      await queue.reset()

      // push应该返回失败
      const result = await pushPromise
      expect(result.success).toBe(false)
      expect(result.pushedSize).toBe(0)
    })

    test.concurrent('reset 应该中断等待的 read 操作', async () => {
      const queue = Queue.new<number>(3)

      // 启动等待的read
      const readPromise = queue.read()

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 重置队列
      await queue.reset()

      // read应该返回失败
      const result = await readPromise
      expect(result.success).toBe(false)
      expect(result.value).toBeUndefined()
    })

    test.concurrent('reset 后应该能正常进行新的操作', async () => {
      const queue = Queue.new<string>(2)

      // 先进行一些操作
      const result1 = await queue.push('old1', 'old2')
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(2)
      expect((await queue.read()).value).toBe('old1')

      // 重置
      await queue.reset()

      // 新的操作应该正常工作
      const result2 = await queue.push('new1', 'new2')
      expect(result2.success).toBe(true)
      expect(result2.pushedSize).toBe(2)
      expect(queue.length()).toBe(2)

      expect((await queue.read()).value).toBe('new1')
      expect((await queue.read()).value).toBe('new2')
      expect(queue.isEmpty).toBe(true)
    })

    test.concurrent('reset 多次应该都能正常工作', async () => {
      const queue = Queue.new<number>(3)

      for (let i = 0; i < 3; i++) {
        const result = await queue.push(i * 10 + 1, i * 10 + 2)
        expect(result.success).toBe(true)
        expect(result.pushedSize).toBe(2)
        expect(queue.length()).toBe(2)

        await queue.reset()
        expect(queue.length()).toBe(0)
        expect(queue.isEmpty).toBe(true)
      }

      // 最后验证还能正常使用
      const result = await queue.push(100)
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(1)
      expect((await queue.read()).value).toBe(100)
    })
  })

  describe('FIFO 顺序测试', () => {
    test.concurrent('应该按FIFO顺序处理元素', async () => {
      const queue = Queue.new<string>(5)

      const result = await queue.push('first', 'second', 'third')
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(3)

      expect((await queue.read()).value).toBe('first')
      expect((await queue.read()).value).toBe('second')
      expect((await queue.read()).value).toBe('third')
    })

    test.concurrent('混合操作应该保持FIFO顺序', async () => {
      const queue = Queue.new<number>(3)

      const result1 = await queue.push(1, 2)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(2)
      expect((await queue.read()).value).toBe(1)

      const result2 = await queue.push(3)
      expect(result2.success).toBe(true)
      expect(result2.pushedSize).toBe(1)
      expect((await queue.read()).value).toBe(2)
      expect((await queue.read()).value).toBe(3)
    })
  })

  describe('边界情况', () => {
    test.concurrent('容量为1的队列应该正常工作', async () => {
      const queue = Queue.new<boolean>(1)

      const result = await queue.push(true)
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(1)
      expect(queue.isFull).toBe(true)
      expect(queue.isEmpty).toBe(false)

      const readResult = await queue.read()
      expect(readResult.value).toBe(true)
      expect(queue.isEmpty).toBe(true)
    })

    test.concurrent('大量并发操作应该正确处理', async () => {
      const queue = Queue.new<number>(10)
      const results: number[] = []
      const pushResults: { success: boolean; pushedSize: number }[] = []

      // 启动多个生产者
      const producers = Array.from({ length: 5 }, (_, i) =>
        Promise.all(
          Array.from({ length: 10 }, async (__, j) => {
            const result = await queue.push(i * 10 + j)
            pushResults.push(result)
            return result
          }),
        ),
      )

      // 启动多个消费者
      const consumers = Array.from({ length: 5 }, () =>
        Promise.all(
          Array.from({ length: 10 }, async () => {
            const result = await queue.read()
            if (result.success) {
              results.push(result.value!)
            }
            return undefined
          }),
        ),
      )

      await Promise.all([...producers, ...consumers])

      expect(results).toHaveLength(50)
      expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i))

      // 验证所有 push 操作都成功，每次推入1个元素
      expect(pushResults).toHaveLength(50)
      pushResults.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.pushedSize).toBe(1)
      })
    })

    test.concurrent('空push调用应该成功且 pushedSize 为 0', async () => {
      const queue = Queue.new<number>(3)

      const result = await queue.push()
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(0)
      expect(queue.length()).toBe(0)
    })

    test.concurrent('push 部分成功的场景 - 队列在推入过程中关闭', async () => {
      const queue = Queue.new<number>(2)

      // 填满队列容量为1，推入多个元素时会被中断
      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)

      // 开始推入多个元素，但在中间关闭队列
      const pushPromise = queue.push(2, 3, 4)

      // 稍等确保第一个元素开始等待
      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 读取一个元素，让第一个待推入元素可以进入
      await queue.read()

      // 稍等让第一个元素推入
      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 关闭队列，中断剩余推入
      await queue.close()

      const result = await pushPromise
      expect(result.success).toBe(false)
      // pushedSize 应该反映实际推入的数量（在关闭前成功推入的数量）
      expect(result.pushedSize).toBeGreaterThanOrEqual(0)
      expect(result.pushedSize).toBeLessThan(3)
    })
  })

  describe('类型安全测试', () => {
    test.concurrent('应该正确处理不同类型', async () => {
      interface TestObject {
        id: number
        name: string
      }

      const queue = Queue.new<TestObject>(3)

      const obj1: TestObject = { id: 1, name: 'test1' }
      const obj2: TestObject = { id: 2, name: 'test2' }

      const result = await queue.push(obj1, obj2)
      expect(result.success).toBe(true)
      expect(result.pushedSize).toBe(2)

      const result1 = await queue.read()
      expect(result1.success).toBe(true)
      expect(result1.value).toEqual(obj1)

      const result2 = await queue.read()
      expect(result2.success).toBe(true)
      expect(result2.value).toEqual(obj2)
    })
  })

  describe('pushedSize 字段详细测试', () => {
    test.concurrent('pushedSize 应该准确反映成功推入的元素数量', async () => {
      const queue = Queue.new<number>(5)

      // 推入1个元素
      const result1 = await queue.push(1)
      expect(result1.success).toBe(true)
      expect(result1.pushedSize).toBe(1)

      // 推入3个元素
      const result2 = await queue.push(2, 3, 4)
      expect(result2.success).toBe(true)
      expect(result2.pushedSize).toBe(3)

      // 推入0个元素
      const result3 = await queue.push()
      expect(result3.success).toBe(true)
      expect(result3.pushedSize).toBe(0)

      expect(queue.length()).toBe(4)
    })

    test.concurrent('队列关闭时 pushedSize 应该为 0', async () => {
      const queue = Queue.new<number>(3)
      await queue.close()

      const result = await queue.push(1, 2, 3)
      expect(result.success).toBe(false)
      expect(result.pushedSize).toBe(0)
    })

    test.concurrent('队列重置时等待的 push 应该返回 pushedSize 为 0', async () => {
      const queue = Queue.new<number>(1)

      // 填满队列
      await queue.push(1)

      // 开始等待的推入
      const pushPromise = queue.push(2, 3)

      await new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })

      // 重置队列
      await queue.reset()

      const result = await pushPromise
      expect(result.success).toBe(false)
      expect(result.pushedSize).toBe(0)
    })
  })
})
