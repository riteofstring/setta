export function createWorkflowGraphRuntimeState({
  canvas,
  decelerationPluginName = "decelerate",
  now,
  onTickerStart,
  ticker,
  viewportPlugins,
}) {
  let destroyed = false;
  let focused = true;
  let frozen = false;

  return {
    destroy() {
      destroyed = true;
      ticker.stop();
      viewportPlugins.pause(decelerationPluginName);
    },
    isFocused: () => focused,
    isFrozen: () => frozen,
    pauseDeceleration() {
      viewportPlugins.pause(decelerationPluginName);
    },
    setFocused(nextFocused) {
      if (destroyed || focused === nextFocused) {
        return false;
      }
      focused = nextFocused;
      return true;
    },
    setFrozen(nextFrozen) {
      if (destroyed || frozen === nextFrozen) {
        return false;
      }
      frozen = nextFrozen;
      canvas.style.pointerEvents = frozen ? "none" : "";
      return true;
    },
    syncDeceleration(interactionsActive) {
      if (destroyed || frozen || !focused || interactionsActive) {
        viewportPlugins.pause(decelerationPluginName);
        return;
      }
      viewportPlugins.resume(decelerationPluginName);
    },
    syncTicker() {
      if (destroyed) {
        return;
      }
      if (frozen || !focused) {
        ticker.stop();
        return;
      }
      if (ticker.started) {
        return;
      }
      onTickerStart(now());
      ticker.start();
    },
  };
}
