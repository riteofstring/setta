export async function assertPinnedPhase0Viewport({ client, workload, waitForState }) {
  if (!workload?.viewport) {
    return;
  }
  const actual = await waitForState(
    client,
    `(() => ({
      devicePixelRatio: window.devicePixelRatio,
      viewport: { height: window.innerHeight, width: window.innerWidth }
    }))()`,
    (value) => phase0ViewportMatches(value, workload),
    5_000,
  ).catch((error) => {
    throw new Error(
      `phase 0 workload viewport/DPR mismatch before recording: expected=${JSON.stringify(
        phase0ExpectedViewport(workload),
      )} lastError=${error instanceof Error ? error.message : String(error)}`,
    );
  });
  if (!phase0ViewportMatches(actual, workload)) {
    throw new Error(
      `phase 0 workload viewport/DPR mismatch before recording: expected=${JSON.stringify(
        phase0ExpectedViewport(workload),
      )} actual=${JSON.stringify(actual)}`,
    );
  }
}

function phase0ViewportMatches(actual, workload) {
  return (
    actual?.viewport?.height === workload.viewport.height &&
    actual?.viewport?.width === workload.viewport.width &&
    (workload.devicePixelRatio === undefined ||
      actual?.devicePixelRatio === workload.devicePixelRatio)
  );
}

function phase0ExpectedViewport(workload) {
  return {
    devicePixelRatio: workload.devicePixelRatio,
    viewport: workload.viewport,
  };
}
