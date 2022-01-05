export type Arguments<T> = T extends (...args: infer R) => void ? R : never

type AccessControl<Event> = {
  events?: Event[]
}

export type PublisherAccessControl<Events> = AccessControl<Events> & {
  canInterceptDispatch?: boolean
  canUnInterceptDispatch?: boolean
}

export type ObserverAccessControl<Events> = AccessControl<Events>
