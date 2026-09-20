import { describe, expect, it, vi } from "vitest";

import type {
  ExportResult,
  ReviewMutation,
  ReviewResponse,
  ReviewSnapshot,
} from "./generatedContract";
import {
  REVIEW_APPLY_PATH,
  REVIEW_EVENTS_PATH,
  REVIEW_EXPORT_PATH,
  REVIEW_PATH,
  ReviewClientError,
  applyReviewMutation,
  exportReview,
  fetchReviewSnapshot,
  subscribeReviewSnapshots,
  type ReviewEventSource,
} from "./client";

const requestSha = "a".repeat(64);

function snapshot(revision = 3): ReviewSnapshot {
  return {
    version: 1,
    project: {
      version: 1,
      id: "review-project",
      name: "Review project",
      requests: ["requests/completion.json"],
    },
    revision,
    requests: [
      {
        path: "requests/completion.json",
        sha256: requestSha,
        request: {
          version: 1,
          id: "completion-request",
          type: "completion",
          title: "Confirm the work",
          requestedDecision: "Review the completion claim.",
          evidence: [],
          relations: [],
          provenance: {
            producer: { kind: "script", name: "fixture" },
            createdAt: "2026-09-19T12:00:00Z",
          },
          completion: {
            claims: [{ id: "tests-pass", text: "The tests pass." }],
          },
        },
        assessments: [],
        response: null,
        evidence: [],
      },
    ],
  };
}

function mutation(): ReviewMutation {
  return {
    projectId: "review-project",
    expectedRevision: 3,
    operations: [{ op: "deleteResponse", requestId: "completion-request" }],
  };
}

function exportResult(includeContinuations = false): ExportResult {
  const current = snapshot(4);
  const request = current.requests[0]!.request;
  const response: ReviewResponse = {
    version: 1,
    id: "human-response",
    requestId: request.id,
    requestSha256: requestSha,
    type: "completion",
    status: "final",
    rationale: "The claim is supported.",
    unresolved: [],
    annotations: [],
    provenance: {
      producer: { kind: "human", name: "Reviewer" },
      createdAt: "2026-09-19T12:30:00Z",
    },
    completion: {
      decisions: [
        {
          claimId: "tests-pass",
          decision: "accepted",
          rationale: "The test evidence is sufficient.",
          qualification: null,
        },
      ],
    },
  };
  return {
    version: 1,
    export: {
      version: 1,
      projectId: "review-project",
      revision: 4,
      responses: [response],
      continuations: includeContinuations
        ? [
            {
              version: 1,
              projectId: "review-project",
              request,
              requestSha256: requestSha,
              response,
              evidence: [
                {
                  evidenceId: "source",
                  status: "resolved",
                  content: {
                    kind: "code",
                    code: "def run():\n    return True\n",
                    language: "python",
                  },
                  error: null,
                },
              ],
            },
          ]
        : [],
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function eventSource(): ReviewEventSource & {
  dispatch(type: string, event: Event): void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type, listener) {
      const group = listeners.get(type) ?? new Set<EventListener>();
      group.add(listener);
      listeners.set(type, group);
    },
    close: vi.fn(),
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    onerror: null,
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
}

describe("review client boundary", () => {
  it("gets and validates the authoritative review snapshot", async () => {
    const current = snapshot();
    const fetchImplementation = vi.fn(async () => jsonResponse(current));

    await expect(
      fetchReviewSnapshot(fetchImplementation as unknown as typeof fetch),
    ).resolves.toEqual(current);
    expect(fetchImplementation).toHaveBeenCalledWith(REVIEW_PATH, {
      headers: { Accept: "application/json" },
      method: "GET",
    });
  });

  it("rejects an invalid snapshot at the generated contract boundary", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ revision: 3 }),
    );

    await expect(
      fetchReviewSnapshot(fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({
      kind: "invalid-response",
    } satisfies Partial<ReviewClientError>);
  });

  it("validates a mutation before sending one exact revision-bound POST", async () => {
    const command = mutation();
    const result = { version: 1 as const, snapshot: snapshot(4) };
    const fetchImplementation = vi.fn(async () => jsonResponse(result));

    await expect(
      applyReviewMutation(
        command,
        fetchImplementation as unknown as typeof fetch,
      ),
    ).resolves.toEqual(result);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledWith(REVIEW_APPLY_PATH, {
      body: JSON.stringify(command),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const invalidFetch = vi.fn();
    await expect(
      applyReviewMutation(
        { ...command, operations: [] },
        invalidFetch as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ kind: "invalid-request" });
    expect(invalidFetch).not.toHaveBeenCalled();
  });

  it("surfaces a structured mutation error without retrying the POST", async () => {
    const structuredError = {
      code: "revision_conflict",
      message: "The review changed; reload before applying this decision.",
      field: null,
      requestId: null,
      evidenceId: null,
    };
    const fetchImplementation = vi.fn(async () =>
      jsonResponse(structuredError, 409),
    );

    await expect(
      applyReviewMutation(
        mutation(),
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      kind: "http",
      status: 409,
      structuredError,
    } satisfies Partial<ReviewClientError>);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("rejects a mutation result for another revision without retrying", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ version: 1, snapshot: snapshot(9) }),
    );

    await expect(
      applyReviewMutation(
        mutation(),
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("does not retry a mutation after an indeterminate network failure", async () => {
    const failure = new TypeError("connection reset");
    const fetchImplementation = vi.fn(async () => Promise.reject(failure));

    await expect(
      applyReviewMutation(
        mutation(),
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      cause: failure,
      kind: "network",
    } satisfies Partial<ReviewClientError>);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("posts an export request and validates its closed result", async () => {
    const exported = exportResult(true);
    const fetchImplementation = vi.fn(async () => jsonResponse(exported));

    await expect(
      exportReview(true, fetchImplementation as unknown as typeof fetch),
    ).resolves.toEqual(exported);
    expect(fetchImplementation).toHaveBeenCalledWith(
      `${REVIEW_EXPORT_PATH}?continuations=true`,
      {
        headers: { Accept: "application/json" },
        method: "POST",
      },
    );

    const invalidFetch = vi.fn(async () =>
      jsonResponse({ ...exportResult(), extra: true }),
    );
    await expect(
      exportReview(false, invalidFetch as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("rejects an unsupported resolved code language", async () => {
    const exported = exportResult(true);
    const continuation = exported.export.continuations[0]!;
    const evidence = continuation.evidence[0]!;
    if (evidence.status !== "resolved" || evidence.content.kind !== "code") {
      throw new Error("Expected resolved code evidence.");
    }
    evidence.content.language = "ruby" as typeof evidence.content.language;
    const fetchImplementation = vi.fn(async () => jsonResponse(exported));

    await expect(
      exportReview(true, fetchImplementation as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("subscribes to named snapshot events and closes an invalid stream", () => {
    const source = eventSource();
    const onSnapshot = vi.fn();
    const onInvalid = vi.fn();
    const createEventSource = vi.fn(() => source);
    const disconnect = subscribeReviewSnapshots(
      { onInvalid, onSnapshot },
      createEventSource,
    );

    expect(createEventSource).toHaveBeenCalledWith(REVIEW_EVENTS_PATH);
    source.dispatch(
      "snapshot",
      new MessageEvent("snapshot", { data: JSON.stringify(snapshot()) }),
    );
    expect(onSnapshot).toHaveBeenCalledWith(snapshot());

    source.dispatch(
      "snapshot",
      new MessageEvent("snapshot", { data: JSON.stringify({ revision: 5 }) }),
    );
    expect(source.close).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledOnce();

    disconnect();
    expect(source.close).toHaveBeenCalledTimes(2);
  });
});
