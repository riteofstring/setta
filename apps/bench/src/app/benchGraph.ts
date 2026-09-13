import type { WorkspaceGraphEdge, WorkspaceGraphPort } from "@setta/workspace";

import type { ApplicationSnapshotV1 } from "../backend/generatedContract";

type BenchGraphProjection = {
  edges: WorkspaceGraphEdge[];
  ports: WorkspaceGraphPort[];
};

function distributedPosition(index: number, count: number): number {
  return (index + 1) / (count + 1);
}

function graphId(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

export function projectBenchGraph(
  snapshot: Pick<ApplicationSnapshotV1, "cases" | "project">,
  visible = true,
): BenchGraphProjection {
  if (!visible) {
    return { edges: [], ports: [] };
  }
  const project = snapshot.project;
  const inputCount = snapshot.cases.length;
  const inputLabel = `${String(inputCount)} ${inputCount === 1 ? "input" : "inputs"}`;
  const resultLabel = `${String(inputCount)} ${inputCount === 1 ? "result" : "results"}`;
  const casePortId = graphId("bench", "case-set", project.caseSet.id, "cases");
  const ports: WorkspaceGraphPort[] = [
    {
      disabled: true,
      family: "data",
      id: casePortId,
      label: "inputs",
      sectionId: project.caseSet.id,
      side: "right",
      type: "source",
    },
  ];
  const edges: WorkspaceGraphEdge[] = [];
  for (const [index, candidate] of project.candidates.entries()) {
    const inputPortId = graphId("bench", "candidate", candidate.id, "cases");
    const outputPortId = graphId("bench", "candidate", candidate.id, "output");
    ports.push(
      {
        disabled: true,
        family: "data",
        id: inputPortId,
        label: "inputs",
        sectionId: candidate.id,
        side: "left",
        type: "target",
      },
      {
        disabled: true,
        family: "data",
        id: outputPortId,
        label: "results",
        sectionId: candidate.id,
        side: "right",
        type: "source",
      },
    );
    edges.push({
      family: "data",
      id: graphId("bench", "cases", candidate.id),
      label: inputLabel,
      source: { portId: casePortId, sectionId: project.caseSet.id },
      target: { portId: inputPortId, sectionId: candidate.id },
    });
    if (project.evaluator !== null) {
      const evaluatorPortId = graphId(
        "bench",
        "evaluator",
        project.evaluator.id,
        candidate.id,
      );
      ports.push({
        disabled: true,
        family: "data",
        id: evaluatorPortId,
        label: candidate.name,
        position: distributedPosition(index, project.candidates.length),
        sectionId: project.evaluator.id,
        side: "left",
        type: "target",
      });
      edges.push({
        family: "data",
        id: graphId("bench", "checks", candidate.id),
        label: resultLabel,
        source: { portId: outputPortId, sectionId: candidate.id },
        target: {
          portId: evaluatorPortId,
          sectionId: project.evaluator.id,
        },
      });
    }
  }
  return { edges, ports };
}

export function pruneBenchSelectedEdgeIds(
  selectedEdgeIds: ReadonlySet<string>,
  edges: ReadonlyArray<WorkspaceGraphEdge>,
): ReadonlySet<string> {
  const available = new Set(edges.map((edge) => edge.id));
  const next = new Set(
    [...selectedEdgeIds].filter((edgeId) => available.has(edgeId)),
  );
  return next.size === selectedEdgeIds.size ? selectedEdgeIds : next;
}
