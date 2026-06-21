export const cameraInputKinds = new Set(["pointer-pan", "wheel", "wheel-burst"]);

export function workflowGraphInputInteractionMetrics(performanceTimeline, inputSamples) {
  const items = workflowGraphInputInteractionItems(performanceTimeline, inputSamples);
  return {
    cameraCount: items.filter((item) => item.cameraInput).length,
    items,
    totalCount: items.length,
  };
}

export function workflowGraphLongTaskMetrics(performanceTimeline, inputInteractions) {
  const entries = performanceTimeline?.longTasks ?? [];
  const cameraWindows = inputInteractions
    .filter((interaction) => interaction.cameraInput)
    .map(inputInteractionWindow)
    .filter((window) => Number.isFinite(window.startTime) && Number.isFinite(window.endTime));
  const cameraOverlappingEntries = overlappingEntries(entries, cameraWindows);
  return {
    cameraOverlappingCount: cameraOverlappingEntries.length,
    cameraOverlappingSamples: cameraOverlappingEntries.slice(0, 12).map(compactPerformanceEntry),
    maxCameraOverlappingDurationMs: maxDuration(cameraOverlappingEntries),
    maxObservedDurationMs: maxDuration(entries),
    observedCount: entries.length,
    observedSamples: entries.slice(0, 12).map(compactPerformanceEntry),
  };
}

function workflowGraphInputInteractionItems(performanceTimeline, inputSamples) {
  const completedInputs = performanceTimeline?.completedInputs ?? [];
  if (completedInputs.length > 0) {
    return inputInteractionsFromCompletedInputs(completedInputs, inputSamples);
  }
  const userTimings = performanceTimeline?.userTimings ?? [];
  const starts = userTimings.filter((entry) => entry.name === "setta.workflow-graph.input.start");
  if (starts.length === 0) {
    return inputInteractionsFromSamples(inputSamples);
  }
  return inputInteractionsFromUserTimings({ inputSamples, starts, userTimings });
}

function inputInteractionsFromCompletedInputs(completedInputs, inputSamples) {
  return completedInputs.map((input, index) =>
    inputInteractionFromCompletedInput({ index, input, inputSamples }),
  );
}

function inputInteractionFromCompletedInput({ index, input, inputSamples }) {
  const sample = inputSamples[index] ?? {};
  const kind = input.kind ?? sample.kind ?? "";
  const cameraInput = Boolean(input.cameraInput ?? cameraInputKinds.has(kind));
  return {
    cameraInput,
    causalSource: input.causalSource ?? (cameraInput ? `camera:${kind}` : `interaction:${kind}`),
    durationMs: finiteNumberOrNull(input.durationMs),
    endedAt: finiteNumberOrNull(input.endedAt),
    eventCount: inputSampleEventCount(sample.kind ? sample : input),
    id: input.token ?? `completed-${index + 1}`,
    kind,
    startedAt: finiteNumberOrNull(input.startedAt),
  };
}

function inputInteractionsFromSamples(inputSamples) {
  return inputSamples.map((sample, index) => inputInteractionFromSample(sample, index));
}

function inputInteractionFromSample(sample, index) {
  const cameraInput = cameraInputKinds.has(sample.kind);
  return {
    cameraInput,
    causalSource: cameraInput ? `camera:${sample.kind}` : `interaction:${sample.kind}`,
    durationMs: finiteNumberOrNull(sample.durationMs),
    endedAt: finiteNumberOrNull(sample.completedAt),
    eventCount: inputSampleEventCount(sample),
    id: `sample-${index + 1}`,
    kind: sample.kind ?? "",
    startedAt: finiteNumberOrNull(sample.startedAt),
  };
}

function inputInteractionsFromUserTimings({ inputSamples, starts, userTimings }) {
  const endsByToken = new Map(
    userTimings
      .filter((entry) => entry.name === "setta.workflow-graph.input.end")
      .map((entry) => [entry.detail?.token, entry]),
  );
  return starts.map((start, index) =>
    inputInteractionFromUserTiming({
      end: endsByToken.get(start.detail?.token),
      index,
      inputSamples,
      start,
    }),
  );
}

function inputInteractionFromUserTiming({ end, index, inputSamples, start }) {
  const detail = start.detail ?? {};
  const sample = inputSamples[index] ?? {};
  return {
    cameraInput: Boolean(detail.cameraInput),
    causalSource: detail.causalSource ?? "",
    durationMs: userTimingEndDuration(end),
    endedAt: userTimingEndAt(end),
    eventCount: inputSampleEventCount(sample),
    id: userTimingInteractionId(detail, index),
    kind: userTimingInteractionKind(detail, sample),
    startedAt: userTimingStartAt(detail, start),
  };
}

function userTimingEndDuration(end) {
  return finiteNumberOrNull(endDetail(end).durationMs);
}

function userTimingEndAt(end) {
  return finiteNumberOrNull(endDetail(end).endedAt ?? end?.startTime);
}

function endDetail(end) {
  return end?.detail ?? {};
}

function userTimingInteractionId(detail, index) {
  return detail.token ?? index + 1;
}

function userTimingInteractionKind(detail, sample) {
  return detail.kind ?? sample.kind ?? "";
}

function userTimingStartAt(detail, start) {
  return finiteNumberOrNull(detail.startedAt ?? start.startTime);
}

function inputInteractionWindow(interaction) {
  const startTime = Number(interaction.startedAt);
  const endTime = Number(interaction.endedAt);
  return {
    endTime: Number.isFinite(endTime) ? endTime : startTime,
    startTime,
  };
}

function overlappingEntries(entries, windows) {
  if (windows.length === 0) {
    return [];
  }
  return entries.filter((entry) => windows.some((window) => entryOverlapsWindow(entry, window)));
}

function entryOverlapsWindow(entry, window) {
  const startTime = Number(entry.startTime);
  return rangesOverlap(
    startTime,
    startTime + Number(entry.duration ?? 0),
    window.startTime,
    window.endTime,
  );
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) {
    return false;
  }
  return leftStart < rightEnd && rightStart < leftEnd;
}

function compactPerformanceEntry(entry) {
  return {
    durationMs: Number(entry.duration ?? 0),
    name: entry.name ?? "",
    startTime: Number(entry.startTime ?? 0),
  };
}

function maxDuration(entries) {
  return entries.reduce((max, entry) => Math.max(max, Number(entry.duration) || 0), 0);
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inputSampleEventCount(sample) {
  if (Array.isArray(sample.events)) {
    return sample.events.length;
  }
  return 1;
}
