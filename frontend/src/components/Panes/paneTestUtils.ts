type StoreWithInitialState = {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
};

export function syncStoreInitialState(store: StoreWithInitialState) {
  // `renderToStaticMarkup` uses Zustand's getInitialState() snapshot rather than getState().
  // Keep the server snapshot aligned with our test's updated state.
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}
