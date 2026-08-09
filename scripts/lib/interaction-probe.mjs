/**
 * In-page instrumentation and trace analysis for the interaction profiler.
 *
 * The probe records animation-frame timestamps, pointer handler spans
 * (window capture-phase entry to window bubble-phase exit), DOM mutation
 * batches, and long tasks while a synthetic gesture runs. Analysis converts
 * one recorded sample into the frame-pacing and activation metrics reported
 * by scripts/profile-interaction.mjs.
 */

export const PROBE_INIT_SCRIPT = `(() => {
  const state = {
    active: false,
    activations: [],
    events: [],
    frames: [],
    longTaskObserver: null,
    longTasks: [],
    mutationObserver: null,
    mutations: [],
    rafId: 0,
  };
  const onFrame = (timestamp) => {
    if (!state.active) {
      return;
    }
    state.frames.push(timestamp);
    state.rafId = requestAnimationFrame(onFrame);
  };
  const recorder = (type, phase) => (event) => {
    if (state.active) {
      state.events.push([type, phase, performance.now(), event.timeStamp]);
    }
  };
  for (const type of ["pointerdown", "pointermove", "pointerup"]) {
    window.addEventListener(type, recorder(type, "capture"), { capture: true, passive: true });
    window.addEventListener(type, recorder(type, "bubble"), { passive: true });
  }
  window.__settaInteractionProbe = {
    begin() {
      state.activations = [];
      state.events = [];
      state.frames = [];
      state.longTasks = [];
      state.mutations = [];
      state.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push([entry.startTime, entry.duration]);
        }
      });
      state.longTaskObserver.observe({ type: "longtask" });
      state.mutationObserver = new MutationObserver((records) => {
        const timestamp = performance.now();
        state.mutations.push(timestamp);
        for (const record of records) {
          if (
            record.type !== "attributes" ||
            record.attributeName !== "data-workspace-interaction-owner"
          ) {
            continue;
          }
          const owner = record.target.getAttribute("data-workspace-interaction-owner");
          if (owner && owner !== "none") {
            state.activations.push([timestamp, owner]);
          }
        }
      });
      state.mutationObserver.observe(document.body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
      state.scrollAtBegin = { x: window.scrollX, y: window.scrollY };
      state.active = true;
      state.rafId = requestAnimationFrame(onFrame);
    },
    end() {
      if (!state.active) {
        throw new Error(
          "The interaction probe has no active recording; the page reloaded after begin().",
        );
      }
      state.active = false;
      cancelAnimationFrame(state.rafId);
      state.longTaskObserver.disconnect();
      state.mutationObserver.disconnect();
      return {
        activations: state.activations,
        events: state.events,
        frames: state.frames,
        longTasks: state.longTasks,
        mutations: state.mutations,
        scroll: {
          begin: state.scrollAtBegin,
          end: { x: window.scrollX, y: window.scrollY },
        },
      };
    },
  };
})();`;

const ACTIVATION_WINDOW_MS = 250;

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Pair window capture-phase entries with their bubble-phase exits. A handler
 * that calls stopPropagation() suppresses the window bubble listener, so the
 * bubble timestamp is optional; the capture timestamp is the event mark.
 */
function eventMarks(events, type) {
  const marks = [];
  for (const [eventType, phase, time] of events) {
    if (eventType !== type) {
      continue;
    }
    if (phase === "capture") {
      marks.push({ bubble: null, capture: time });
    } else if (marks.length > 0 && marks[marks.length - 1].bubble === null) {
      marks[marks.length - 1].bubble = time;
    }
  }
  return marks;
}

function handlerSpanMs(mark) {
  return mark.bubble === null ? null : round1(mark.bubble - mark.capture);
}

function completedSpanDurations(marks) {
  return marks.filter((mark) => mark.bubble !== null).map((mark) => mark.bubble - mark.capture);
}

function intervals(times) {
  const result = [];
  for (let index = 1; index < times.length; index += 1) {
    result.push(times[index] - times[index - 1]);
  }
  return result;
}

function maxOf(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}

function meanOf(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function gapStats(gaps) {
  return {
    maxGapMs: round1(maxOf(gaps)),
    over20Count: gaps.filter((gap) => gap > 20).length,
    over32Count: gaps.filter((gap) => gap > 32).length,
    over50Count: gaps.filter((gap) => gap >= 50).length,
  };
}

function firstAfter(times, reference) {
  const found = times.find((time) => time > reference);
  return found === undefined ? null : round1(found - reference);
}

function requiredSingleMark(marks, label) {
  if (marks.length !== 1) {
    throw new Error(`Expected exactly one ${label} event, saw ${String(marks.length)}.`);
  }
  return marks[0];
}

function overlappingLongTasks(longTasks, start, end) {
  return longTasks
    .filter(([taskStart, duration]) => taskStart + duration >= start && taskStart <= end)
    .map(([taskStart, duration]) => ({
      durationMs: round1(duration),
      startOffsetMs: round1(taskStart - start),
    }));
}

/**
 * Convert one probe sample into gesture metrics. The gesture window runs from
 * the pointer-down capture timestamp to the pointer-up bubble timestamp plus
 * the settle the driver waited before ending the probe.
 */
export function analyzeGestureSample(sample) {
  const down = requiredSingleMark(eventMarks(sample.events, "pointerdown"), "pointerdown");
  const up = requiredSingleMark(eventMarks(sample.events, "pointerup"), "pointerup");
  const moveMarks = eventMarks(sample.events, "pointermove");
  const moveCaptureTimes = moveMarks.map((mark) => mark.capture);
  const moveIntervals = intervals(moveCaptureTimes);
  // Anchor at the last frame before pointer-down so the first gap spans the
  // activation stall instead of starting after it.
  const anchorIndex = sample.frames.findLastIndex((time) => time <= down.capture);
  const gestureFrames = sample.frames.slice(Math.max(anchorIndex, 0));
  const frameGaps = intervals(gestureFrames);
  const activationLimit = down.capture + ACTIVATION_WINDOW_MS;
  const activationTimes = sample.activations.map(([time]) => time);
  const activationGaps = [];
  const sustainedGaps = [];
  for (let index = 1; index < gestureFrames.length; index += 1) {
    (gestureFrames[index] <= activationLimit ? activationGaps : sustainedGaps).push(
      frameGaps[index - 1],
    );
  }
  return {
    activation: gapStats(activationGaps),
    activationOwners: [...new Set(sample.activations.map(([, owner]) => owner))],
    firstActivationAfterDownMs: firstAfter(activationTimes, down.capture),
    firstFrameAfterDownMs: firstAfter(sample.frames, down.capture),
    firstMutationAfterDownMs: firstAfter(sample.mutations, down.capture),
    frameCount: gestureFrames.length,
    gapsOver20Ms: frameGaps.filter((gap) => gap > 20).map(round1),
    longTasks: overlappingLongTasks(
      sample.longTasks,
      down.capture,
      up.capture + ACTIVATION_WINDOW_MS,
    ),
    maxMoveHandlerMs: round1(maxOf(completedSpanDurations(moveMarks))),
    meanMoveIntervalMs: round1(meanOf(moveIntervals)),
    moveCount: moveCaptureTimes.length,
    maxMoveIntervalMs: round1(maxOf(moveIntervals)),
    overall: gapStats(frameGaps),
    pageScrollDelta: {
      x: round1(sample.scroll.end.x - sample.scroll.begin.x),
      y: round1(sample.scroll.end.y - sample.scroll.begin.y),
    },
    pointerDownHandlerMs: handlerSpanMs(down),
    pointerUpHandlerMs: handlerSpanMs(up),
    sustained: gapStats(sustainedGaps),
  };
}

const CDP_COUNT_METRICS = ["LayoutCount", "RecalcStyleCount"];
const CDP_DURATION_METRICS = [
  "LayoutDuration",
  "RecalcStyleDuration",
  "ScriptDuration",
  "TaskDuration",
];

/** Diff two Chrome DevTools Performance.getMetrics snapshots. */
export function cdpMetricsDelta(before, after) {
  const toMap = (metrics) => new Map(metrics.map((metric) => [metric.name, metric.value]));
  const beforeMap = toMap(before);
  const afterMap = toMap(after);
  const delta = {};
  for (const name of CDP_COUNT_METRICS) {
    delta[name] = (afterMap.get(name) ?? 0) - (beforeMap.get(name) ?? 0);
  }
  for (const name of CDP_DURATION_METRICS) {
    delta[`${name}Ms`] = round1(((afterMap.get(name) ?? 0) - (beforeMap.get(name) ?? 0)) * 1000);
  }
  return delta;
}
