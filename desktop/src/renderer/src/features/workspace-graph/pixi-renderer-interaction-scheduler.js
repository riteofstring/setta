const interactionLaneDefinitions = [
  {
    id: "camera-input",
    priority: 1,
  },
  {
    id: "visible-position-sync",
    priority: 2,
  },
  {
    id: "hover-selection-feedback",
    priority: 3,
  },
  {
    id: "semantic-runtime-visual",
    priority: 4,
  },
  {
    id: "settled-fidelity-restore",
    priority: 5,
  },
  {
    id: "background-recompute",
    priority: 6,
  },
];

const interactionLanesById = new Map(interactionLaneDefinitions.map((lane) => [lane.id, lane]));

export function createWorkflowGraphInteractionScheduler({ debugMetrics }) {
  let nextSequence = 1;
  const laneRunCounts = new Map(interactionLaneDefinitions.map((lane) => [lane.id, 0]));
  const recentLaneRuns = [];

  return {
    debugSnapshot,
    runLane,
  };

  function runLane(laneId, callback, details = undefined) {
    const lane = requireInteractionLane(laneId);
    const sequence = nextSequence;
    nextSequence += 1;
    laneRunCounts.set(lane.id, (laneRunCounts.get(lane.id) ?? 0) + 1);
    recentLaneRuns.push({
      id: lane.id,
      priority: lane.priority,
      sequence,
    });
    if (recentLaneRuns.length > 24) {
      recentLaneRuns.shift();
    }
    return debugMetrics.measure(
      `scheduler-lane-${lane.id}`,
      callback,
      details === undefined
        ? { lanePriority: lane.priority, laneSequence: sequence }
        : { ...details, lanePriority: lane.priority, laneSequence: sequence },
    );
  }

  function debugSnapshot() {
    return {
      interactionSchedulerLaneCounts: Object.fromEntries(laneRunCounts),
      interactionSchedulerLaneDefinitions: interactionLaneDefinitions.map((lane) => ({ ...lane })),
      interactionSchedulerLastLanePriority: recentLaneRuns.at(-1)?.priority ?? null,
      interactionSchedulerRecentLaneRuns: recentLaneRuns.map((run) => ({ ...run })),
      interactionSchedulerRunCount: nextSequence - 1,
    };
  }
}

function requireInteractionLane(laneId) {
  const lane = interactionLanesById.get(laneId);
  if (!lane) {
    throw new Error(`unknown workflow graph interaction scheduler lane: ${laneId}`);
  }
  return lane;
}
