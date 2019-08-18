export type StoreReducer<T, A> = (state: T, action: A) => T

export class Store<A, T> {
  private currentState: T
  private reducer: (state: T, action: A) => T
  private listeners: Array<(state: T, action: A) => void>

  constructor(reducer: StoreReducer<T, A>, initialState: T) {
    this.currentState = initialState
    this.reducer = reducer
    this.listeners = []
  }

  getState(): T {
    return this.currentState
  }

  dispatch(action: A) {
    this.currentState = this.reducer(this.currentState, action)

    this.listeners.forEach(listener => {
      listener(this.getState(), action)
    })
  }

  subscribe(listener: (state: T, action: A) => void) {
    this.listeners.push(listener)
  }
}

export type StoreProxyDispatcher<A> = (a: A) => void

export class StoreProxy<A, T, AProxy = A, TProxy = T> {
  private store: Store<A, T>
  private proxyAction: (a: AProxy, dispatch: StoreProxyDispatcher<A>) => void
  private proxyState: (s: T) => TProxy

  constructor(
    store: Store<A, T>,
    options: {
      proxyAction: (a: AProxy, dispatch: StoreProxyDispatcher<A>) => void,
      proxyState: (s: T) => TProxy
    }
  ) {
    this.store = store
    this.proxyAction = options.proxyAction
    this.proxyState = options.proxyState
  }

  dispatch(action: AProxy) {
    this.proxyAction(action, this.store.dispatch.bind(this.store))
  }

  getState(): TProxy {
    return this.proxyState(this.store.getState())
  }

  subscribe(listener: (state: TProxy, action: A) => void) {
    this.store.subscribe((state, action) => {
      listener(this.proxyState(state), action)
    })
  }
}

export function createStore<A, T>(reducer: (state: T, action: A) => T, initialState: T) {
  return new Store(reducer, initialState)
}

export function proxyStore<A, T, AProxy = A, TProxy = T>(
  store: Store<A, T>,
  options: {
    proxyAction: (a: AProxy, dispatch: StoreProxyDispatcher<A>) => void,
    proxyState: (s: T) => TProxy
  }
) {
  return new StoreProxy(store, options)
}

