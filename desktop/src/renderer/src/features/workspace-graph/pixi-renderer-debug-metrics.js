/* global performance */

const maxTimingSamples = 360;

export function createWorkflowGraphDebugMetrics({ app, enabled }) {
  if (!enabled) {
    return noopWorkflowGraphDebugMetrics();
  }
  let nextSequence = 1;
  let pixiRenderStartedAt = null;
  const timingSamples = [];
  const timingBuckets = new Map();
  const pixiRenderProbe = {
    postrender() {
      if (pixiRenderStartedAt === null) {
        return;
      }
      recordDuration("pixi-render", performance.now() - pixiRenderStartedAt, {
        rendererTick: app.renderer.tick,
      });
      pixiRenderStartedAt = null;
    },
    prerender() {
      pixiRenderStartedAt = performance.now();
    },
  };

  app.renderer.runners.prerender.add(pixiRenderProbe);
  app.renderer.runners.postrender.add(pixiRenderProbe);

  return {
    destroy,
    measure,
    recordDuration,
    snapshot,
  };

  function destroy() {
    app.renderer.runners.prerender.remove(pixiRenderProbe);
    app.renderer.runners.postrender.remove(pixiRenderProbe);
  }

  function measure(bucket, callback, details = undefined) {
    const startedAt = performance.now();
    try {
      return callback();
    } finally {
      recordDuration(bucket, performance.now() - startedAt, details);
    }
  }

  function recordDuration(bucket, durationMs, details = undefined) {
    if (!Number.isFinite(durationMs)) {
      return;
    }
    const sample = {
      at: performance.now(),
      bucket,
      durationMs,
      sequence: nextSequence,
    };
    nextSequence += 1;
    if (details !== undefined) {
      sample.details = details;
    }
    timingSamples.push(sample);
    if (timingSamples.length > maxTimingSamples) {
      timingSamples.shift();
    }
    const aggregate = timingBuckets.get(bucket) ?? {
      count: 0,
      totalMs: 0,
      worstMs: 0,
    };
    aggregate.count += 1;
    aggregate.totalMs += durationMs;
    aggregate.worstMs = Math.max(aggregate.worstMs, durationMs);
    aggregate.recentMs = durationMs;
    timingBuckets.set(bucket, aggregate);
  }

  function snapshot() {
    return {
      timingBuckets: Object.fromEntries(
        [...timingBuckets.entries()].map(([bucket, aggregate]) => [
          bucket,
          {
            averageMs: aggregate.count === 0 ? 0 : aggregate.totalMs / aggregate.count,
            count: aggregate.count,
            recentMs: aggregate.recentMs ?? 0,
            totalMs: aggregate.totalMs,
            worstMs: aggregate.worstMs,
          },
        ]),
      ),
      timingSampleLimit: maxTimingSamples,
      timingSamples: [...timingSamples],
    };
  }
}

function noopWorkflowGraphDebugMetrics() {
  return {
    destroy() {},
    measure(_bucket, callback) {
      return callback();
    },
    recordDuration() {},
    snapshot() {
      return {
        timingBuckets: {},
        timingSampleLimit: maxTimingSamples,
        timingSamples: [],
      };
    },
  };
}
