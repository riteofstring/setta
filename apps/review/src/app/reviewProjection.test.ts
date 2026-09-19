import { describe, expect, it } from "vitest";

import type { ReviewSnapshot } from "../backend/generatedContract";
import {
  evidenceSectionId,
  projectReviewDocument,
  projectReviewGraph,
  requestSectionId,
} from "./reviewProjection";

const snapshot: ReviewSnapshot = {
  project: {
    id: "project",
    name: "Project",
    requests: ["request.json"],
    version: 1,
  },
  requests: [
    {
      assessments: [],
      evidence: [
        {
          content: {
            endLine: 4,
            kind: "text",
            startLine: 2,
            text: "two\nthree\nfour",
            truncated: false,
          },
          error: null,
          evidenceId: "log",
          status: "resolved",
        },
      ],
      path: "request.json",
      request: {
        completion: { claims: [{ id: "claim", text: "It works" }] },
        evidence: [
          {
            id: "log",
            kind: "text",
            text: {
              endLine: 4,
              mediaType: "text/plain",
              path: "results/run.log",
              sourceSha256: "a".repeat(64),
              startLine: 2,
            },
          },
        ],
        id: "request",
        provenance: {
          createdAt: "2026-09-19T00:00:00Z",
          producer: { kind: "script", name: "fixture" },
        },
        relations: [
          {
            citations: [{ endLine: 3, kind: "lineRange", startLine: 2 }],
            evidenceId: "log",
            id: "claim-log",
            role: "supports",
            subjectId: "claim",
            subjectKind: "claim",
          },
        ],
        requestedDecision: "Verify it.",
        title: "Check the run",
        type: "completion",
        version: 1,
      },
      response: null,
      sha256: "a".repeat(64),
    },
  ],
  revision: 0,
  version: 1,
};

describe("review Workspace projection", () => {
  it("projects request and evidence without a low-information request section", () => {
    const document = projectReviewDocument(snapshot);
    expect(Object.keys(document.sections)).toEqual([
      requestSectionId("request"),
      evidenceSectionId("request", "log"),
    ]);
    expect(document.sections[requestSectionId("request")]?.name).toBe(
      "Check the run",
    );
    expect(document.sections[evidenceSectionId("request", "log")]?.name).toBe(
      "run.log",
    );
  });

  it("selects only the evidence relation for the active subject", () => {
    const graph = projectReviewGraph(snapshot, {
      requestId: "request",
      subjectId: "claim",
      subjectKind: "claim",
    });
    expect(graph.edges).toHaveLength(1);
    expect(graph.ports).toHaveLength(2);
    expect([...graph.selectedEdgeIds]).toEqual([
      "review:edge:request:claim-log",
    ]);
  });
});
