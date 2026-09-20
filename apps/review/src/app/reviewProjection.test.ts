import { describe, expect, it } from "vitest";

import type { ReviewSnapshot } from "../backend/generatedContract";
import { completionResponse } from "./reviewModel";
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
        completion: {
          claims: [
            { id: "claim", text: "It works" },
            { id: "other-claim", text: "It is fast" },
          ],
        },
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
          {
            citations: [{ endLine: 4, kind: "lineRange", startLine: 4 }],
            evidenceId: "log",
            id: "other-claim-log",
            role: "qualifies",
            subjectId: "other-claim",
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

function finalizedSnapshot(): ReviewSnapshot {
  const request = snapshot.requests[0];
  if (!request) {
    throw new Error("The projection fixture requires one request.");
  }
  const firstDecision = {
    ...request,
    response: completionResponse(request, {
      claimId: "claim",
      decision: "accepted",
      qualification: null,
      rationale: "Verified.",
    }),
  };
  return {
    ...snapshot,
    requests: [
      {
        ...firstDecision,
        response: completionResponse(firstDecision, {
          claimId: "other-claim",
          decision: "accepted",
          qualification: null,
          rationale: "Verified.",
        }),
      },
    ],
  };
}

function projectedViews(source: ReviewSnapshot) {
  const savedViews = projectReviewDocument(source).savedViews;
  const current = savedViews?.views.current;
  const old = savedViews?.views.old;
  if (!savedViews || !current || !old) {
    throw new Error("The review projection requires Current and Old views.");
  }
  return { activeViewId: savedViews.activeViewId, current, old };
}

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
    expect(
      Object.values(document.sections).every(
        (section) => section.tagColor === null,
      ),
    ).toBe(true);
  });

  it("projects Current and Old as native Workspace views", () => {
    const { activeViewId, current, old } = projectedViews(snapshot);

    expect(activeViewId).toBe("current");
    expect([current.name, old.name]).toEqual(["Current", "Old"]);
    expect(current.sectionVisibility[requestSectionId("request")]).toBe(true);
    expect(old.sectionVisibility[requestSectionId("request")]).toBe(false);
  });

  it("moves a finalized request and all of its evidence from Current to Old", () => {
    const { activeViewId, current, old } = projectedViews(finalizedSnapshot());
    const ids = [
      requestSectionId("request"),
      evidenceSectionId("request", "log"),
    ];

    expect(activeViewId).toBe("current");
    for (const id of ids) {
      expect(current.sectionVisibility[id]).toBe(false);
      expect(old.sectionVisibility[id]).toBe(true);
    }
    expect(old.topLevelSections[requestSectionId("request")]?.y).toBe(64);
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

  it("does not project relationship wiring without an active subject", () => {
    const graph = projectReviewGraph(snapshot, null);
    expect(graph.edges).toEqual([]);
    expect(graph.ports).toEqual([]);
    expect(graph.selectedEdgeIds.size).toBe(0);
  });
});
