import { SyncEvent } from '@/sync-event'

enum State {
  INITIAL = 'initial',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

class StateManager {
  static State = State

  #state: State = State.INITIAL

  #ev = SyncEvent.new<{
    stateChange: (prevState: State, nextState: State) => void
  }>()

  get state() {
    return this.#state
  }

  get subscriber() {
    return this.#ev.subscriber
  }

  updateState = (state: State) => {
    if (state === this.#state) {
      return
    }
    const prevState = this.#state
    this.#state = state
    this.#ev.emit('stateChange', prevState, state)
  }
}

export { State }
export { StateManager }
