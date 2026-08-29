export const INTERACTION_PROBE_INIT_SCRIPT = `(() => {
  const state = {
    active: false,
    events: [],
    frames: [],
    initialTargetStyle: null,
    longTaskObserver: null,
    longTasks: [],
    mutationObserver: null,
    mutations: [],
    rafId: 0,
    scrollAtBegin: null,
    target: null,
    targetMutations: [],
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
    begin(targetSelector) {
      if (state.active) {
        throw new Error("The interaction probe is already recording.");
      }
      const target = document.querySelector(targetSelector);
      if (!target) {
        throw new Error("The interaction probe target is missing: " + targetSelector);
      }
      if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        throw new Error("The performance profile requires long-task observation support.");
      }
      state.events = [];
      state.frames = [];
      state.initialTargetStyle = target.getAttribute("style");
      state.longTasks = [];
      state.mutations = [];
      state.target = target;
      state.targetMutations = [];
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
          if (record.target === state.target && record.type === "attributes") {
            state.targetMutations.push(timestamp);
          }
        }
      });
      state.mutationObserver.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      state.scrollAtBegin = { x: window.scrollX, y: window.scrollY };
      state.active = true;
      state.rafId = requestAnimationFrame(onFrame);
    },
    end() {
      if (!state.active) {
        throw new Error("The interaction probe has no active recording.");
      }
      state.active = false;
      cancelAnimationFrame(state.rafId);
      state.longTaskObserver.disconnect();
      state.mutationObserver.disconnect();
      return {
        events: state.events,
        finalTargetStyle: state.target.getAttribute("style"),
        frames: state.frames,
        initialTargetStyle: state.initialTargetStyle,
        longTasks: state.longTasks,
        mutations: state.mutations,
        scroll: {
          begin: state.scrollAtBegin,
          end: { x: window.scrollX, y: window.scrollY },
        },
        targetMutations: state.targetMutations,
      };
    },
  };
})();`;

const ACTIVATION_WINDOW_MS = 250;

function round1(value) {
  return Math.round(value * 10) / 10;
}

function eventMarks(events, type) {
  const marks = [];
  for (const [eventType, phase, time] of events) {
    if (eventType !== type) {
      continue;
    }
    if (phase === "capture") {
      marks.push({ bubble: null, capture: time });
    } else if (marks.length > 0 && marks.at(-1).bubble === null) {
      marks[marks.length - 1].bubble = time;
    }
  }
  return marks;
}

function intervals(times) {
  return times.slice(1).map((time, index) => time - times[index]);
}

function maxOf(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}

function meanOf(values) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
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
    throw new Error(
      `Expected exactly one ${label} event, saw ${String(marks.length)}.`,
    );
  }
  return marks[0];
}

function completedSpanDurations(marks) {
  return marks
    .filter(({ bubble }) => bubble !== null)
    .map(({ bubble, capture }) => bubble - capture);
}

function handlerSpanMs(mark) {
  return mark.bubble === null ? null : round1(mark.bubble - mark.capture);
}

function overlappingLongTasks(longTasks, start, end) {
  return longTasks
    .filter(
      ([taskStart, duration]) =>
        taskStart + duration >= start && taskStart <= end,
    )
    .map(([taskStart, duration]) => ({
      durationMs: round1(duration),
      startOffsetMs: round1(taskStart - start),
    }));
}

export function analyzeGestureSample(sample) {
  const down = requiredSingleMark(
    eventMarks(sample.events, "pointerdown"),
    "pointerdown",
  );
  const up = requiredSingleMark(
    eventMarks(sample.events, "pointerup"),
    "pointerup",
  );
  const moveMarks = eventMarks(sample.events, "pointermove");
  const moveCaptureTimes = moveMarks.map(({ capture }) => capture);
  const anchorIndex = sample.frames.findLastIndex(
    (time) => time <= down.capture,
  );
  const gestureFrames = sample.frames.slice(Math.max(anchorIndex, 0));
  const frameGaps = intervals(gestureFrames);
  const activationLimit = down.capture + ACTIVATION_WINDOW_MS;
  const activationGaps = [];
  const sustainedGaps = [];
  for (let index = 1; index < gestureFrames.length; index += 1) {
    const destination =
      gestureFrames[index] <= activationLimit ? activationGaps : sustainedGaps;
    destination.push(frameGaps[index - 1]);
  }
  return {
    activation: gapStats(activationGaps),
    firstFrameAfterDownMs: firstAfter(sample.frames, down.capture),
    firstMutationAfterDownMs: firstAfter(sample.mutations, down.capture),
    firstTargetMutationAfterDownMs: firstAfter(
      sample.targetMutations,
      down.capture,
    ),
    frameCount: gestureFrames.length,
    initialTargetStyle: sample.initialTargetStyle,
    finalTargetStyle: sample.finalTargetStyle,
    longTasks: overlappingLongTasks(
      sample.longTasks,
      down.capture,
      up.capture + ACTIVATION_WINDOW_MS,
    ),
    maxMoveHandlerMs: round1(maxOf(completedSpanDurations(moveMarks))),
    maxMoveIntervalMs: round1(maxOf(intervals(moveCaptureTimes))),
    meanMoveIntervalMs: round1(meanOf(intervals(moveCaptureTimes))),
    moveCount: moveCaptureTimes.length,
    overall: gapStats(frameGaps),
    pageScrollDelta: {
      x: round1(sample.scroll.end.x - sample.scroll.begin.x),
      y: round1(sample.scroll.end.y - sample.scroll.begin.y),
    },
    pointerDownHandlerMs: handlerSpanMs(down),
    pointerUpHandlerMs: handlerSpanMs(up),
    sustained: gapStats(sustainedGaps),
    targetMutationCount: sample.targetMutations.length,
  };
}

const CDP_COUNT_METRICS = ["LayoutCount", "RecalcStyleCount"];
const CDP_DURATION_METRICS = [
  "LayoutDuration",
  "RecalcStyleDuration",
  "ScriptDuration",
  "TaskDuration",
];

function metricsMap(metrics) {
  return new Map(metrics.map(({ name, value }) => [name, value]));
}

export function cdpMetricsDelta(before, after) {
  const beforeMap = metricsMap(before);
  const afterMap = metricsMap(after);
  const delta = {};
  for (const name of CDP_COUNT_METRICS) {
    delta[name] = (afterMap.get(name) ?? 0) - (beforeMap.get(name) ?? 0);
  }
  for (const name of CDP_DURATION_METRICS) {
    delta[`${name}Ms`] = round1(
      ((afterMap.get(name) ?? 0) - (beforeMap.get(name) ?? 0)) * 1_000,
    );
  }
  return delta;
}

export function selectCdpMetrics(metrics) {
  const values = metricsMap(metrics);
  return {
    LayoutCount: Math.round(values.get("LayoutCount") ?? 0),
    RecalcStyleCount: Math.round(values.get("RecalcStyleCount") ?? 0),
    LayoutDurationMs: round1((values.get("LayoutDuration") ?? 0) * 1_000),
    RecalcStyleDurationMs: round1(
      (values.get("RecalcStyleDuration") ?? 0) * 1_000,
    ),
    ScriptDurationMs: round1((values.get("ScriptDuration") ?? 0) * 1_000),
    TaskDurationMs: round1((values.get("TaskDuration") ?? 0) * 1_000),
  };
}
