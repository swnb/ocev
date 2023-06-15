import { createListenerLinker } from './linkable-listener'
import { SyncEvent } from './sync-event'
import { HandlerMap, LinkableListener } from './types'

export class InnerHookAbleSyncEvent<M extends HandlerMap> extends SyncEvent<M> {
  public override on = <K extends keyof M>(type: K, handler: M[K]): LinkableListener<M> => {
    // @ts-ignore
    this.dispatch('__onSyncEventListener__', type)

    const cancelFunction = super.on(type, handler)

    return createListenerLinker(this.on, this.once, [cancelFunction])
  }

  public override off = <K extends keyof M>(type: K, handler: M[K]) => {
    // @ts-ignore
    this.dispatch('__offSyncEventListener__', type)

    super.off(type, handler)

    return this
  }
}
