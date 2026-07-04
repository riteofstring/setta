const target120HzFrameMs = 8.33;
const fallback60HzFrameMs = 16.67;
const maximumSlowFrameRatio = 0.08;
const p95FrameBudgetMultiplier = 1.35;
const p99FrameBudgetMultiplier = 2;
const slowFrameBudgetMultiplier = 1.25;

export function observedFrameBudgetMs(sample) {
  if (Number.isFinite(sample.observedFrameBudgetMs) && sample.observedFrameBudgetMs > 0) {
    return sample.observedFrameBudgetMs;
  }
  return sample.p50FrameDeltaMs <= 10 ? target120HzFrameMs : fallback60HzFrameMs;
}

export function assertSmoothFrameSample(sample, label, options = {}) {
  const minFrameCount = options.minFrameCount ?? 20;
  const frameBudgetMs = observedFrameBudgetMs(sample);
  assertMinimumFrameCount(sample, label, minFrameCount);
  assertNoLongTasks(sample, label);
  assertNoDroppedFrames(sample, label);
  assertSlowFrameRatio(sample, label, frameBudgetMs);
  assertFrameQuantiles(sample, label, frameBudgetMs);
}

function assertMinimumFrameCount(sample, label, minFrameCount) {
  if (sample.frameCount >= minFrameCount) {
    return;
  }
  throw new Error(`${label} had too few frames: ${JSON.stringify(sample)}`);
}

function assertNoLongTasks(sample, label) {
  if (sample.longTaskCount === 0) {
    return;
  }
  throw new Error(`${label} recorded long tasks: ${JSON.stringify(sample)}`);
}

function assertNoDroppedFrames(sample, label) {
  if (sample.slowFramesOver50Ms === 0) {
    return;
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

export function frameBudgetSummary(sample) {
  return {
    observedFrameBudgetMs: observedFrameBudgetMs(sample),
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
