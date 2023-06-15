import { createListenerLinker } from './linkable-listener'
import { SyncEvent } from './sync-event'
import { HandlerMap, ISyncEvent, LinkableListener } from './types'

export class InnerHookAbleSyncEvent<M extends HandlerMap>
  extends SyncEvent<M>
  implements ISyncEvent<M>
{
  // factory pattern
  static new<M extends HandlerMap>() {
    return new InnerHookAbleSyncEvent<M>()
  }

  constructor() {
    super()

    // can't use super because is is bug of typescript
    const superOn = this.on
    const superOff = this.off

    // override
    this.on = <K extends keyof M>(type: K, handler: M[K]): LinkableListener<M> => {
      if (type !== '__onSyncEventListener__' && type !== '__offSyncEventListener__') {
        // @ts-ignore
        this.dispatch('__onSyncEventListener__', type)
      }

      const cancelFunction = superOn(type, handler)

      return createListenerLinker(this.on, this.once, [cancelFunction])
    }

    // override
    this.off = <K extends keyof M>(type: K, handler: M[K]) => {
      // @ts-ignore
      this.dispatch('__offSyncEventListener__', type)

      superOff(type, handler)

      return this
    }
  }
}
