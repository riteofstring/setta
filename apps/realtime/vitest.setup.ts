class ResizeObserverStub {
  public observe(): void {}

  public unobserve(): void {}

  public disconnect(): void {}
}

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: ResizeObserverStub,
});
