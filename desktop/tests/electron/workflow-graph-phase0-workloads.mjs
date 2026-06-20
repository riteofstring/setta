export const phase0WorkloadDefinitions = {
  dense: {
    edgeCount: 900,
    labelCap: "visible-window",
    nodeCount: 650,
    randomSeed: "phase0-dense-v1",
    repetitionCount: 1,
    semanticNodeCount: 150,
    stressOnly: false,
    syntheticNodeCount: 500,
    syntheticScene: "phase0-dense",
    trajectorySpriteCount: 1000,
    viewport: { height: 900, width: 1440 },
    warmUpCount: 1,
    workflowNodeCount: 500,
    zoomLevel: "fit-visible-cluster",
  },
  normal: {
    edgeCount: 150,
    labelCap: "visible-window",
    nodeCount: 125,
    randomSeed: "phase0-normal-v1",
    repetitionCount: 1,
    semanticNodeCount: 25,
    stressOnly: false,
    syntheticNodeCount: 100,
    syntheticScene: "phase0-normal",
    trajectorySpriteCount: 200,
    viewport: { height: 900, width: 1440 },
    warmUpCount: 1,
    workflowNodeCount: 100,
    zoomLevel: "fit-visible-cluster",
  },
  simple: {
    edgeCount: 2,
    labelCap: "visible-window",
    nodeCount: 3,
    randomSeed: "phase0-simple-v1",
    repetitionCount: 1,
    semanticNodeCount: 0,
    stressOnly: false,
    syntheticNodeCount: 3,
    syntheticScene: "phase0-simple",
    trajectorySpriteCount: 0,
    viewport: { height: 900, width: 1440 },
    warmUpCount: 1,
    workflowNodeCount: 3,
    zoomLevel: "fit-graph",
  },
  stress: {
    edgeCount: 2000,
    labelCap: "visible-window",
    nodeCount: 1300,
    randomSeed: "phase0-stress-v1",
    repetitionCount: 1,
    semanticNodeCount: 300,
    stressOnly: true,
    syntheticNodeCount: 1000,
    syntheticScene: "phase0-stress",
    trajectorySpriteCount: 2000,
    viewport: { height: 900, width: 1440 },
    warmUpCount: 1,
    workflowNodeCount: 1000,
    zoomLevel: "fit-visible-cluster",
  },
};

export function phase0WorkloadForScenario(scenario, nodeCount) {
  if (scenario === "scaling") {
    return {
      edgeCount: Math.max(2, Math.round(nodeCount * 1.5)),
      labelCap: "visible-window",
      randomSeed: "phase0-scaling-v1",
      repetitionCount: 1,
      semanticNodeCount: 25,
      stressOnly: false,
      trajectorySpriteCount: 200,
      viewport: { height: 900, width: 1440 },
      visibleContent: "first 100 workflow nodes plus 25 semantic nodes",
      warmUpCount: 1,
      workflowNodeCount: nodeCount,
      zoomLevel: "fixed-visible-cluster",
    };
  }
  return phase0WorkloadDefinitions[scenario] ?? null;
}

export function launchEnvForScenario({ nodeCount, scenario, syntheticScene }) {
  const env = {
    SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    SETTA_WORKFLOW_GRAPH_DEBUG: "1",
  };
  const phase0Workload = phase0WorkloadDefinitions[scenario];
  if (phase0Workload) {
    return {
      ...env,
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: "1",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: String(phase0Workload.syntheticNodeCount),
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: phase0Workload.syntheticScene,
    };
  }
  if (scenario === "scaling") {
    return workflowSyntheticEnv(env, {
      nodeCount,
      scene: syntheticScene,
    });
  }
  if (scenario === "active") {
    return workflowSyntheticEnv(env, {
      nodeCount: 6,
      scene: "merged",
    });
  }
  if (scenario === "small-active") {
    return workflowSyntheticEnv(env, {
      nodeCount: 3,
      scene: "workflow-running-runtime",
    });
  }
  if (scenario === "large") {
    return workflowSyntheticEnv(env, {
      nodeCount,
      scene: syntheticScene,
    });
  }
  return env;
}

function workflowSyntheticEnv(env, { nodeCount, scene }) {
  return {
    ...env,
    SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: "1",
    SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: String(nodeCount),
    SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: scene,
  };
}
