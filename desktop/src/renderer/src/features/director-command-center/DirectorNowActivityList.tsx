import type {
  EvidenceClass,
  SemanticActor,
  SemanticNode,
  SemanticNodeKind,
  SemanticNodeStatus,
  WorkstreamGraph,
} from "@generated/backend";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { semanticNodeMode } from "../director-graph/semantic-graph-visual-catalog";

export type DirectorNowActivity = readonly SemanticNode[];

const nowActivityLimit = 5;

const semanticNodeKindLabels = {
  action: "Action",
  approval_required: "Approval",
  artifact: "Artifact",
  blocked: "Blocked",
  cancelled: "Cancelled",
  completed: "Completed",
  delegation: "Delegation",
  director_decision: "Director",
  failed: "Failed",
  investigation: "Investigation",
  milestone: "Milestone",
  plan: "Plan",
  recovery: "Recovery",
  resource_required: "Resource",
  retry: "Retry",
  user_goal: "User",
  validation: "Validation",
} as const satisfies Record<SemanticNodeKind, string>;

const semanticNodeStatusLabels = {
  active: "Active",
  cancelled: "Cancelled",
  failed: "Failed",
  pending: "Pending",
  succeeded: "Done",
  waiting: "Waiting",
} as const satisfies Record<SemanticNodeStatus, string>;

const semanticActorLabels = {
  director: "Director",
  provider: "Provider",
  system: "System",
  user: "User",
  worker: "Worker",
} as const satisfies Record<SemanticActor, string>;

const semanticEvidenceLabels = {
  director_interpretation: "Interpreted",
  runtime_fact: "Observed",
  structured_declaration: "Declared",
} as const satisfies Record<EvidenceClass, string>;

export function DirectorNowActivityList({
  activity,
}: {
  activity: DirectorNowActivity;
}): React.JSX.Element {
  return (
    <section className="director-rail-section" aria-label="Current activity">
      <p className="director-rail-kicker">Activity</p>
      {activity.length > 0 ? (
        <ol className="director-activity-list">
          {activity.map((node, index) => (
            <CurrentActivityItem initiallyExpanded={index === 0} key={node.id} node={node} />
          ))}
        </ol>
      ) : (
        <p className="director-rail-summary">No current activity.</p>
      )}
    </section>
  );
}

export function currentDirectorActivity(graph: WorkstreamGraph | null): DirectorNowActivity {
  if (graph === null) {
    return [];
  }
  return graph.nodes.filter(isDirectorActivityNode).slice(-nowActivityLimit).reverse();
}

function CurrentActivityItem({
  initiallyExpanded,
  node,
}: {
  initiallyExpanded: boolean;
  node: SemanticNode;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const detailId = `director-activity-${node.id}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const metadata = directorActivityMetadata(node);
  const tone = semanticNodeMode(node.kind, node.status);
  useEffect(() => {
    if (initiallyExpanded) {
      setExpanded(true);
    }
  }, [initiallyExpanded, node.id]);
  return (
    <li>
      <article
        className="director-activity-item"
        data-activity-tone={tone}
        data-expanded={expanded ? "true" : "false"}
        data-node-evidence={node.evidenceClass}
        data-node-kind={node.kind}
        data-node-status={node.status}
      >
        <button
          aria-controls={detailId}
          aria-expanded={expanded}
          className="director-activity-toggle"
          onClick={() => {
            setExpanded((current) => !current);
          }}
          type="button"
        >
          <span aria-hidden="true" className="director-activity-dot" />
          <span className="director-activity-copy">
            <span className="director-activity-title">{node.publicSummary}</span>
            <span className="director-activity-meta">
              {semanticNodeKindLabels[node.kind]} / {semanticNodeStatusLabels[node.status]}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="director-activity-disclosure" size={15} />
        </button>
        <div className="director-activity-detail" hidden={!expanded} id={detailId}>
          {metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </article>
    </li>
  );
}

function directorActivityMetadata(node: SemanticNode): string[] {
  const metadata = [
    semanticActorLabels[node.actor],
    semanticEvidenceLabels[node.evidenceClass],
    `${node.sourceEventIds.length} ${node.sourceEventIds.length === 1 ? "source" : "sources"}`,
  ];
  if (node.artifactIds.length > 0) {
    metadata.push(
      `${node.artifactIds.length} ${node.artifactIds.length === 1 ? "artifact" : "artifacts"}`,
    );
  }
  if (node.interpretation?.confidence !== null && node.interpretation?.confidence !== undefined) {
    metadata.push(`${Math.round(node.interpretation.confidence * 100)}% confidence`);
  }
  return metadata;
}

function isDirectorActivityNode(node: SemanticNode): boolean {
  return node.kind !== "user_goal";
}
