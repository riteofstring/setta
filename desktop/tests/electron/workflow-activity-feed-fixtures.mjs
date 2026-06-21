export function activityWorkflowGraph(prompt, options = {}) {
  const includeDownstreamAction = options.includeDownstreamAction === true;
  const edges = [
    {
      condition: {
        exitCode: null,
        invert: false,
        kind: "always",
        nodeId: "",
        signalName: "",
        signalValue: "",
        status: null,
      },
      fromNodeId: "start",
      id: "start_activity",
      kind: "normal",
      toNodeId: "activity",
    },
  ];
  if (includeDownstreamAction) {
    edges.push(
      {
        condition: null,
        fromNodeId: "activity",
        id: "activity_after_stop",
        kind: "normal",
        toNodeId: "after_stop",
      },
      {
        condition: null,
        fromNodeId: "after_stop",
        id: "after_stop_end",
        kind: "normal",
        toNodeId: "end",
      },
    );
  } else {
    edges.push({
      condition: null,
      fromNodeId: "activity",
      id: "activity_end",
      kind: "normal",
      toNodeId: "end",
    });
  }
  const layoutNodes = [
    { nodeId: "start", x: -280, y: 0 },
    { nodeId: "activity", x: 0, y: 120 },
  ];
  if (includeDownstreamAction) {
    layoutNodes.push({ nodeId: "after_stop", x: 280, y: 120 }, { nodeId: "end", x: 560, y: 0 });
  } else {
    layoutNodes.push({ nodeId: "end", x: 280, y: 0 });
  }
  const nodes = [
    {
      action: null,
      gateway: null,
      id: "start",
      kind: "start",
      loopGuard: null,
      title: "Start",
    },
    {
      action: {
        codex: {
          freshConversation: true,
          model: "",
          prompt,
          reasoningEffort: "",
        },
        kind: "agent.codex",
      },
      gateway: null,
      id: "activity",
      kind: "action",
      loopGuard: null,
      title: "Activity",
    },
  ];
  if (includeDownstreamAction) {
    nodes.push({
      action: {
        codex: {
          freshConversation: true,
          model: "",
          prompt: "queued follow-up after cancel",
          reasoningEffort: "",
        },
        kind: "agent.codex",
      },
      gateway: null,
      id: "after_stop",
      kind: "action",
      loopGuard: null,
      title: "After Stop",
    });
  }
  nodes.push({
    action: null,
    gateway: null,
    id: "end",
    kind: "end",
    loopGuard: null,
    title: "End",
  });
  return {
    edges,
    layout: {
      nodes: layoutNodes,
    },
    nodes,
  };
}
