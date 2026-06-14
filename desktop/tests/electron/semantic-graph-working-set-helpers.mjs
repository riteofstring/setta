import { waitForState } from "./electron-cdp-harness.mjs";

export function assertCartographerAuditBurst({ expectedBuiltCount, result }) {
  if (result.builtCount !== expectedBuiltCount || result.auditEventCount < result.builtCount) {
    throw new Error(
      `cartographer audit burst did not deliver enough events: ${JSON.stringify(result)}`,
    );
  }
  const missingWorkingSetArea = result.changedAreas.find(
    (areas) => !areas.includes("cartographer_audit") || !areas.includes("working_set"),
  );
  if (missingWorkingSetArea) {
    throw new Error(
      `cartographer audit burst omitted working-set invalidation: ${JSON.stringify(result)}`,
    );
  }
}

export async function assertSemanticWorkingSetAfterAuditBurst({
  auditBurst,
  client,
  seedConstraintNodeId,
  seedWorkflowExecutionId,
  workspaceId,
}) {
  const workingSet = await waitForState(
    client,
    `window.setta.semanticGraph.readWorkingSet({
      chatRunId: "",
      limit: 40,
      workflowExecutionId: ${JSON.stringify(seedWorkflowExecutionId)},
      workspaceId: ${JSON.stringify(workspaceId)}
    })`,
    (value) =>
      auditBurst.runIds.every((runId) =>
        value.candidateTargets.some(
          (target) =>
            target.targetEntityId === seedConstraintNodeId && target.runIds.includes(runId),
        ),
      ),
  );
  const target = workingSet.candidateTargets.find(
    (candidate) => candidate.targetEntityId === seedConstraintNodeId,
  );
  if (!target || !auditBurst.runIds.every((runId) => target.runIds.includes(runId))) {
    throw new Error(`semantic working set target readback mismatch: ${JSON.stringify(workingSet)}`);
  }
}

export async function buildUntargetedLiveCartographerSource({
  client,
  seedWorkflowExecutionId,
  seedWorkflowNodeId,
  workspaceId,
}) {
  return client.evaluate(`(async () => {
    const workspaceId = ${JSON.stringify(workspaceId)};
    const sourceRefs = {
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      runItemId: "semantic_live_working_set_run_item",
      workflowDefinitionId: "semantic_seed_workflow_definition",
      workflowExecutionId: ${JSON.stringify(seedWorkflowExecutionId)},
      workflowNodeExecutionId: "semantic_live_workflow_node_execution",
      workflowNodeId: ${JSON.stringify(seedWorkflowNodeId)}
    };
    const graphBefore = await window.setta.semanticGraph.read({ workspaceId });
    const built = await window.setta.semanticGraph.buildCartographerWindow({
      runStatus: "",
      sourceRefs,
      summary: "E2E live working-set source pulse without a committed semantic target.",
      targetEntityId: "",
      terminalReason: "",
      triggerKind: "workflow_window",
      workspaceId
    });
    const workingSet = await window.setta.semanticGraph.readWorkingSet({
      chatRunId: "",
      limit: 40,
      workflowExecutionId: ${JSON.stringify(seedWorkflowExecutionId)},
      workspaceId
    });
    const graphAfter = await window.setta.semanticGraph.read({ workspaceId });
    return {
      built,
      graphNodeIdsAfter: graphAfter.nodes.map((node) => node.id).sort(),
      graphNodeIdsBefore: graphBefore.nodes.map((node) => node.id).sort(),
      pulseNodeId: \`semantic-live-source:semantic-working-set-source:run:\${built.run.id}\`,
      sourceRefs,
      workingSet
    };
  })()`);
}

export function assertUntargetedLiveCartographerSource({ result, seedWorkflowNodeId }) {
  assertQueuedUntargetedRun(result.built.run);
  assertCommittedGraphUnchanged(result);
  assertActiveSourceIds(result, seedWorkflowNodeId);
  assertLiveSourceRef(result, seedWorkflowNodeId);
}

export function assertSemanticWorkingSetPulseVisible({ liveSource, seedWorkflowNodeId, snapshot }) {
  const pulse = graphNodeById(snapshot, liveSource.pulseNodeId);
  if (pulse.layer !== "semantic" || pulse.width !== 18 || pulse.height !== 18) {
    throw new Error(`semantic working-set pulse shape mismatch: ${JSON.stringify(pulse)}`);
  }
  if (pulse.semanticPulseKind !== "active_workflow_source") {
    throw new Error(`semantic working-set pulse kind mismatch: ${JSON.stringify(pulse)}`);
  }
  const sourceEdge = snapshot.graph.edges.find(
    (edge) =>
      edge.id === `semantic-live-source:semantic-working-set-source:run:${liveSource.built.run.id}`,
  );
  const workflowNodeVisible = snapshot.graph.nodes.some((node) => node.id === seedWorkflowNodeId);
  if (workflowNodeVisible && sourceEdge?.targetNodeId !== liveSource.pulseNodeId) {
    throw new Error(
      `semantic working-set source edge mismatch: ${JSON.stringify({
        snapshot: snapshot.graph,
        sourceEdge,
      })}`,
    );
  }
}

export function assertRendererStableForWorkingSetUpdate({
  after,
  assertRendererStable,
  before,
  label,
}) {
  assertRendererStable(before, after, label);
  if (after.render.graphUpdateCount <= before.render.graphUpdateCount) {
    throw new Error(
      `${label} did not update live graph data: before=${JSON.stringify(
        before.render,
      )} after=${JSON.stringify(after.render)}`,
    );
  }
  if (
    JSON.stringify(committedSemanticNodeIds(after)) !==
      JSON.stringify(committedSemanticNodeIds(before)) ||
    JSON.stringify(semanticEdgeIds(after)) !== JSON.stringify(semanticEdgeIds(before))
  ) {
    throw new Error(
      `${label} changed committed semantic graph topology: before=${JSON.stringify(
        before.graph,
      )} after=${JSON.stringify(after.graph)}`,
    );
  }
}

function assertQueuedUntargetedRun(run) {
  if (run.status !== "queued" || run.targetEntityId !== "") {
    throw new Error(`live cartographer source run mismatch: ${JSON.stringify(run)}`);
  }
}

function assertCommittedGraphUnchanged(result) {
  if (JSON.stringify(result.graphNodeIdsAfter) !== JSON.stringify(result.graphNodeIdsBefore)) {
    throw new Error(
      `live cartographer source mutated committed semantic graph: ${JSON.stringify(result)}`,
    );
  }
}

function assertActiveSourceIds(result, seedWorkflowNodeId) {
  if (!result.workingSet.activeWorkflowNodeIds.includes(seedWorkflowNodeId)) {
    throw new Error(
      `live cartographer source omitted active workflow node: ${JSON.stringify(result.workingSet)}`,
    );
  }
  if (!result.workingSet.activeRunItemIds.includes(result.sourceRefs.runItemId)) {
    throw new Error(
      `live cartographer source omitted active run item: ${JSON.stringify(result.workingSet)}`,
    );
  }
}

function assertLiveSourceRef(result, seedWorkflowNodeId) {
  const source = result.workingSet.liveSourceRefs.find(
    (candidate) => candidate.runId === result.built.run.id,
  );
  if (!source || source.status !== "queued" || source.targetEntityId !== "") {
    throw new Error(`live source ref status mismatch: ${JSON.stringify(result.workingSet)}`);
  }
  if (
    source.sourceRefs.workflowNodeId !== seedWorkflowNodeId ||
    source.sourceRefs.runItemId !== result.sourceRefs.runItemId
  ) {
    throw new Error(`live source ref source mismatch: ${JSON.stringify(result.workingSet)}`);
  }
  assertWorkingSetPulseKind(result, "active_workflow_source");
}

function assertWorkingSetPulseKind(result, kind) {
  if (!result.workingSet.pulses.some((pulse) => pulse.kind === kind)) {
    throw new Error(`working-set pulse ${kind} missing: ${JSON.stringify(result.workingSet)}`);
  }
}

function graphNodeById(snapshot, nodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(
      `node ${nodeId} missing from graph snapshot: ${JSON.stringify(snapshot.graph)}`,
    );
  }
  return node;
}

function committedSemanticNodeIds(snapshot) {
  return snapshot.graph.nodes
    .filter((node) => node.id.startsWith("semantic:"))
    .map((node) => node.id)
    .sort();
}

function semanticEdgeIds(snapshot) {
  return snapshot.graph.edges
    .filter((edge) => edge.id.startsWith("semantic-edge:"))
    .map((edge) => edge.id)
    .sort();
}
