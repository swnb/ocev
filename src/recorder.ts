import type { Arguments, HandlerMap } from './types'
import type { SyncEvent } from './sync-event'

/**
 * EventRecorder record all event fired by eventProducer,
 * and will fire all event to eventConsumer when method 'replay' is called.
 */
class EventRecorder<M extends HandlerMap> {
  #eventProducer: SyncEvent<M>

  #eventConsumer: SyncEvent<M>

  #eventFiredQueue: { eventKey: keyof M; value: Arguments<M[keyof M]> }[] = []

  #cancelFn?: VoidFunction

  #isRecording = false

  #shouldRecordAfterReplay = false

  constructor(eventProducer: SyncEvent<M>, eventConsumer: SyncEvent<M>) {
    this.#eventProducer = eventProducer
    this.#eventConsumer = eventConsumer
  }

  /**
   * get the subscriber of eventConsumer,
   * when replay, all event will be fired to this subscriber.
   */
  get subscriber() {
    return this.#eventConsumer.subscriber
  }

  /**
   * start record event,
   * all event fired from eventProducer will be recorded until method 'stop' is called.
   */
  record = () => {
    this.#isRecording = true
    this.#cancelFn = this.#eventProducer.any((eventKey, ...args) => {
      this.#eventFiredQueue.push({ eventKey, value: args })
    })
  }

  /**
   * stop record event from eventProducer
   */
  stop = () => {
    this.#cancelFn?.()
    this.#cancelFn = undefined
    this.#isRecording = false
    this.#shouldRecordAfterReplay = false
  }

  /**
   * replay all event recorded
   */
  replay = () => {
    if (this.#isRecording) {
      this.stop()
      this.#shouldRecordAfterReplay = true
    }

    for (let i = 0; i < this.#eventFiredQueue.length; i++) {
      const { eventKey, value } = this.#eventFiredQueue[i]
      this.#eventConsumer.emit(eventKey, ...value)
    }

    if (this.#shouldRecordAfterReplay) {
      this.record()
    }
  }

  /**
   * clear all event recorded.
   */
  clear = () => {
    this.#eventFiredQueue = []
  }
}

export { EventRecorder }
