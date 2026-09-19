import { describe, expect, it, vi } from "vitest";

import type { RequestSnapshot } from "../backend/generatedContract";
import {
  changesRequestedResponse,
  completionResponse,
  selectedChoiceResponse,
} from "./reviewModel";

const sha = "a".repeat(64);

function completionSnapshot(): RequestSnapshot {
  return {
    assessments: [],
    evidence: [],
    path: "requests/completion.json",
    request: {
      completion: {
        claims: [
          { id: "one", text: "First claim" },
          { id: "two", text: "Second claim" },
        ],
      },
      evidence: [],
      id: "completion",
      provenance: {
        createdAt: "2026-09-19T00:00:00Z",
        producer: { kind: "script", name: "fixture" },
      },
      relations: [],
      requestedDecision: "Review the claims.",
      title: "Review completion",
      type: "completion",
      version: 1,
    },
    response: null,
    sha256: sha,
  };
}

function choiceSnapshot(): RequestSnapshot {
  return {
    assessments: [],
    evidence: [],
    path: "requests/choice.json",
    request: {
      choice: {
        expectedResponse: "selection",
        factors: [{ description: "", id: "speed", label: "Speed" }],
        options: [
          {
            artifactEvidenceId: "artifact-a",
            description: "",
            id: "a",
            label: "Option A",
          },
        ],
        presentation: "artifacts",
        recommendation: null,
        tradeoffs: [],
      },
      evidence: [
        {
          artifact: {
            byteLength: 10,
            mediaType: "image/png",
            path: "a.png",
            sha256: sha,
          },
          id: "artifact-a",
          kind: "artifact",
        },
      ],
      id: "choice",
      provenance: {
        createdAt: "2026-09-19T00:00:00Z",
        producer: { kind: "script", name: "fixture" },
      },
      relations: [],
      requestedDecision: "Pick one.",
      title: "Pick an option",
      type: "choice",
      version: 1,
    },
    response: null,
    sha256: sha,
  };
}

describe("review response builders", () => {
  it("keeps unresolved completion claims until every claim has a decision", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const first = completionResponse(completionSnapshot(), {
      claimId: "one",
      decision: "accepted",
      qualification: null,
      rationale: "Verified.",
    });
    expect(first.status).toBe("draft");
    expect(first.unresolved).toEqual([
      {
        reason: "No human decision recorded.",
        subjectId: "two",
        subjectKind: "claim",
      },
    ]);
    vi.useRealTimers();
  });

  it("anchors a confirmed artifact selection to its evidence", () => {
    const response = selectedChoiceResponse(choiceSnapshot(), ["a"], "Ship A");
    expect(response.type).toBe("choice");
    expect(response.type === "choice" && response.choice).toMatchObject({
      optionIds: ["a"],
      outcome: "selected",
      selectedArtifactEvidenceIds: ["artifact-a"],
    });
  });

  it("requires written or drawn revision feedback", () => {
    expect(() => changesRequestedResponse(choiceSnapshot(), "", [])).toThrow(
      "Describe or draw",
    );
  });
});
