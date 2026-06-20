/* global performance */

const maxCameraFrameSceneVisitSamples = 180;

const requiredSceneVisitCounterNames = [
  "settaOwnedLayerVisits",
  "graphObjectsConsidered",
  "cullCandidatesChecked",
  "displayObjectsTraversed",
  "labelsConsidered",
  "boundsCalculations",
];

export function createWorkflowGraphSceneVisitCounters({ now = () => performance.now() } = {}) {
  let activeFrame = null;
  let nextFrameSequence = 1;
  const cameraFrameSamples = [];
  const totals = emptySceneVisitCounters();

  return {
    beginFrame,
    endFrame,
    markCameraFrame,
    record,
    snapshot,
  };

  function beginFrame({ frameCount = 0 } = {}) {
    if (activeFrame !== null) {
      endFrame();
    }
    activeFrame = {
      ...emptySceneVisitCounters(),
      cameraFrame: false,
      frameCount,
      sequence: nextFrameSequence,
      startedAt: now(),
    };
    nextFrameSequence += 1;
  }

  function endFrame({ frameMs = null } = {}) {
    if (activeFrame === null) {
      return null;
    }
    const sample = {
      ...activeFrame,
      endedAt: now(),
      frameMs: finiteOrNull(frameMs),
      totalSceneVisits: totalSceneVisits(activeFrame),
    };
    activeFrame = null;
    if (sample.cameraFrame) {
      cameraFrameSamples.push(sample);
      if (cameraFrameSamples.length > maxCameraFrameSceneVisitSamples) {
        cameraFrameSamples.shift();
      }
    }
    return sample;
  }

  function markCameraFrame() {
    if (activeFrame !== null) {
      activeFrame.cameraFrame = true;
    }
  }

  function record(counterName, count = 1) {
    if (!requiredSceneVisitCounterNames.includes(counterName)) {
      throw new Error(`unknown workflow graph scene visit counter: ${counterName}`);
    }
    const normalizedCount = Math.max(0, Math.trunc(Number(count) || 0));
    if (normalizedCount === 0) {
      return;
    }
    totals[counterName] += normalizedCount;
    if (activeFrame !== null) {
      activeFrame[counterName] += normalizedCount;
    }
  }

  function snapshot({ visibleRenderableCount = null } = {}) {
    return {
      cameraFrameSampleLimit: maxCameraFrameSceneVisitSamples,
      cameraFrameSamples: cameraFrameSamples.map((sample) => ({ ...sample })),
      cameraFrameSceneVisitStats: sceneVisitSampleStats(cameraFrameSamples),
      requiredCounterNames: [...requiredSceneVisitCounterNames],
      totals: {
        ...totals,
        totalSceneVisits: totalSceneVisits(totals),
      },
      visibleRenderableCount: finiteOrNull(visibleRenderableCount),
    };
  }
}

function emptySceneVisitCounters() {
  return Object.fromEntries(requiredSceneVisitCounterNames.map((counter) => [counter, 0]));
}

function sceneVisitSampleStats(samples) {
  const stats = {};
  for (const counterName of [...requiredSceneVisitCounterNames, "totalSceneVisits"]) {
    const values = samples.map((sample) => Number(sample[counterName] ?? 0));
    stats[counterName] = sampleStats(values);
  }
  return {
    counters: stats,
    sampleCount: samples.length,
  };
}

function sampleStats(values) {
  return {
    max: maxNumber(values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    sampleCount: values.length,
  };
}

function totalSceneVisits(counters) {
  return requiredSceneVisitCounterNames.reduce(
    (sum, counterName) => sum + Number(counters[counterName] ?? 0),
    0,
  );
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function maxNumber(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}
