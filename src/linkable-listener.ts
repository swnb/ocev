import type { LinkableListener } from './types'

export function createListenerLinker<M>(
  createOnListener: <K extends keyof M>(key: K, callback: M[K]) => VoidFunction,
  createOnceListener: <K extends keyof M>(key: K, callback: M[K]) => VoidFunction,
  context: VoidFunction[],
): LinkableListener<M> {
  const cancelFunction: LinkableListener<M> = () => {
    context.reverse().forEach(f => f())
  }

  cancelFunction.on = <K extends keyof M>(type: K, callback: M[K]): LinkableListener<M> => {
    const savedContext = [...context, createOnListener(type, callback)]

    return createListenerLinker(createOnListener, createOnceListener, savedContext)
  }

  cancelFunction.once = <K extends keyof M>(type: K, callback: M[K]): LinkableListener<M> => {
    const savedContext = [...context, createOnceListener(type, callback)]

    return createListenerLinker(createOnListener, createOnceListener, savedContext)
  }

  return Object.freeze(cancelFunction)
}
