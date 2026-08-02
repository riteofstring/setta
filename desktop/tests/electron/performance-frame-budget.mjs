const target120HzFrameMs = 8.33;
const fallback60HzFrameMs = 16.67;
const maximumSlowFrameRatio = 0.08;
const p95FrameBudgetMultiplier = 1.35;
const p99FrameBudgetMultiplier = 2;
const slowFrameBudgetMultiplier = 1.25;

export function observedFrameBudgetMs(sample, options = {}) {
  const configuredFrameBudgetMs = configuredPositiveFrameBudgetMs(options);
  if (configuredFrameBudgetMs !== null) {
    return configuredFrameBudgetMs;
  }
  if (Number.isFinite(sample.observedFrameBudgetMs) && sample.observedFrameBudgetMs > 0) {
    return sample.observedFrameBudgetMs;
  }
  return sample.p50FrameDeltaMs <= 10 ? target120HzFrameMs : fallback60HzFrameMs;
}

export function assertSmoothFrameSample(sample, label, options = {}) {
  const minFrameCount = options.minFrameCount ?? 20;
  const frameBudgetMs = observedFrameBudgetMs(sample, options);
  assertMinimumFrameCount(sample, label, minFrameCount);
  assertNoLongTasks(sample, label, options);
  assertNoDroppedFrames(sample, label, options);
  assertSlowFrameRatio(sample, label, frameBudgetMs);
  assertFrameQuantiles(sample, label, frameBudgetMs);
}

function assertMinimumFrameCount(sample, label, minFrameCount) {
  if (sample.frameCount >= minFrameCount) {
    return;
  }
  throw new Error(`${label} had too few frames: ${JSON.stringify(sample)}`);
}

function assertNoLongTasks(sample, label, options = {}) {
  if (sample.longTaskCount === 0) {
    return;
  }
  const maxLongTaskCount = options.maxLongTaskCount ?? 0;
  if (maxLongTaskCount > 0) {
    const maxLongTaskTotalMs = options.maxLongTaskTotalMs;
    if (!Number.isFinite(maxLongTaskTotalMs) || maxLongTaskTotalMs <= 0) {
      throw new Error("maxLongTaskTotalMs is required when maxLongTaskCount is greater than zero");
    }
    if (sample.longTaskCount <= maxLongTaskCount && sample.longTaskTotalMs <= maxLongTaskTotalMs) {
      return;
    }
  }
  throw new Error(`${label} recorded long tasks: ${JSON.stringify(sample)}`);
}

function assertNoDroppedFrames(sample, label, options = {}) {
  if (sample.slowFramesOver50Ms === 0) {
    return;
  }
  const maxSlowFramesOver50Ms = options.maxSlowFramesOver50Ms ?? 0;
  if (maxSlowFramesOver50Ms > 0) {
    const maxFrameDeltaMs = options.maxFrameDeltaMs;
    if (!Number.isFinite(maxFrameDeltaMs) || maxFrameDeltaMs <= 50) {
      throw new Error(
        `maxFrameDeltaMs must be greater than 50 when maxSlowFramesOver50Ms is greater than zero: ${maxFrameDeltaMs}`,
      );
    }
    if (
      sample.slowFramesOver50Ms <= maxSlowFramesOver50Ms &&
      sample.maxFrameDeltaMs <= maxFrameDeltaMs
    ) {
      return;
    }
  }
  throw new Error(`${label} dropped a frame over 50ms: ${JSON.stringify(sample)}`);
}

function assertSlowFrameRatio(sample, label, frameBudgetMs) {
  const slowFrameThresholdMs = frameBudgetMs * slowFrameBudgetMultiplier;
  const slowFrameCount = slowFrameCountForSample(sample, frameBudgetMs, slowFrameThresholdMs);
  const slowFrameRatio = sample.frameCount > 0 ? slowFrameCount / sample.frameCount : 1;
  if (slowFrameRatio <= maximumSlowFrameRatio) {
    return;
  }
  throw new Error(
    `${label} exceeded the slow-frame ratio for ${slowFrameThresholdMs.toFixed(
      2,
    )}ms threshold: ${JSON.stringify({ sample, slowFrameRatio })}`,
  );
}

function slowFrameCountForSample(sample, frameBudgetMs, slowFrameThresholdMs) {
  if (Array.isArray(sample.framesMs)) {
    return sample.framesMs.filter((value) => value > slowFrameThresholdMs).length;
  }
  return fallbackSlowFrameCount(sample, frameBudgetMs);
}

function assertFrameQuantiles(sample, label, frameBudgetMs) {
  if (sample.p95FrameDeltaMs > frameBudgetMs * p95FrameBudgetMultiplier) {
    throw new Error(
      `${label} p95 frame delta exceeded budget: ${JSON.stringify({ frameBudgetMs, sample })}`,
    );
  }
  const p99Limit = Math.max(frameBudgetMs * p99FrameBudgetMultiplier, 24);
  if (sample.p99FrameDeltaMs > p99Limit) {
    throw new Error(
      `${label} p99 frame delta exceeded budget: ${JSON.stringify({ p99Limit, sample })}`,
    );
  }
}

export function frameBudgetSummary(sample, options = {}) {
  return {
    observedFrameBudgetMs: observedFrameBudgetMs(sample, options),
    p95FrameBudgetMultiplier,
    p99FrameBudgetMultiplier,
    target120HzFrameMs,
  };
}

function fallbackSlowFrameCount(sample, frameBudgetMs) {
  if (frameBudgetMs <= 10) {
    return sample.slowFramesOver120HzBudget;
  }
  return sample.slowFramesOver32Ms;
}

function configuredPositiveFrameBudgetMs(options) {
  if (options.frameBudgetMs === undefined) {
    return null;
  }
  if (!Number.isFinite(options.frameBudgetMs) || options.frameBudgetMs <= 0) {
    throw new Error(`frameBudgetMs must be a positive finite number: ${options.frameBudgetMs}`);
  }
  return options.frameBudgetMs;
}
