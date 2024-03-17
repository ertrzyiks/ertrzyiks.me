import { createStore, proxyStore } from "./store";

enum TestAction {
  INCREMENT,
  DECREMENT,
}

enum EnhancedTestAction {
  DECREMENT,
  BUMP,
}

test("dispatch", () => {
  const store = createStore((counter, action: TestAction) => {
    switch (action) {
      case TestAction.INCREMENT:
        return counter + 1;

      case TestAction.DECREMENT:
        return counter - 1;
    }
  }, 1);

  expect(store.getState()).toBe(1);
  store.dispatch(TestAction.INCREMENT);
  expect(store.getState()).toBe(2);
  store.dispatch(TestAction.DECREMENT);
  expect(store.getState()).toBe(1);
});

test("subscribe", () => {
  const store = createStore((counter, action: TestAction) => {
    switch (action) {
      case TestAction.INCREMENT:
        return counter + 1;

      case TestAction.DECREMENT:
        return counter - 1;
    }
  }, 1);

  const fn = jest.fn();

  store.subscribe(fn);

  store.dispatch(TestAction.INCREMENT);
  expect(fn).toHaveBeenCalledWith(2, TestAction.INCREMENT);
});

test("proxy store state", () => {
  const store = createStore((counter, action: TestAction) => {
    switch (action) {
      case TestAction.INCREMENT:
        return counter + 1;

      case TestAction.DECREMENT:
        return counter - 1;
    }
  }, 1);

  const proxy = proxyStore(store, {
    proxyAction: (a, dispatch) => dispatch(a),
    proxyState: (s) => s * s,
  });

  expect(proxy.getState()).toBe(1);
  proxy.dispatch(TestAction.INCREMENT);
  expect(proxy.getState()).toBe(4);
  proxy.dispatch(TestAction.INCREMENT);
  expect(proxy.getState()).toBe(9);
});

test("proxy store action", () => {
  const store = createStore((counter, action: TestAction) => {
    switch (action) {
      case TestAction.INCREMENT:
        return counter + 1;

      case TestAction.DECREMENT:
        return counter - 1;
    }
  }, 1);

  const proxy = proxyStore(store, {
    proxyAction: (a: EnhancedTestAction, dispatch) => {
      switch (a) {
        case EnhancedTestAction.BUMP:
          dispatch(TestAction.INCREMENT);
          break;

        case EnhancedTestAction.DECREMENT:
          dispatch(TestAction.DECREMENT);
          break;
      }
    },
    proxyState: (s) => s,
  });

  expect(proxy.getState()).toBe(1);
  proxy.dispatch(EnhancedTestAction.BUMP);
  expect(proxy.getState()).toBe(2);
  proxy.dispatch(EnhancedTestAction.BUMP);
  expect(proxy.getState()).toBe(3);
});
