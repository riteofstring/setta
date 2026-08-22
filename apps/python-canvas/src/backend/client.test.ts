import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, it, vi } from "vitest";

import {
  PROJECT_CALLABLE_COMPLETIONS_PATH_V1,
  PROJECT_CALLABLE_PATH_V1,
  PROJECT_PARAMETERS_PATH_V1,
  PROJECT_TARGET_PATH_V1,
  PROJECT_PATH_V1,
} from "./generatedContract";
import {
  ProjectClientError,
  commitCallable,
  completeCallable,
  fetchProjectSnapshot,
  setCallableParameters,
  setPythonTarget,
} from "./client";

describe("Python Canvas project client", () => {
  it("uses one JSON GET request and validates the successful response", async () => {
    const response = createJsonResponse(projectSnapshotFixture);
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await expect(
      fetchProjectSnapshot(fetchImplementation as typeof fetch),
    ).resolves.toEqual(projectSnapshotFixture);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(PROJECT_PATH_V1, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("commits the callable through the generated V1 route", async () => {
    const response = createJsonResponse(projectSnapshotFixture);
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await commitCallable(
      {
        authoredExpression: "math.sqrt",
        projectId: "project:python-canvas",
        sectionId: "callable:square-root",
      },
      fetchImplementation as typeof fetch,
    );

    expect(fetchImplementation).toHaveBeenCalledWith(PROJECT_CALLABLE_PATH_V1, {
      body: JSON.stringify({
        authoredExpression: "math.sqrt",
        projectId: "project:python-canvas",
        sectionId: "callable:square-root",
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("sends the complete revision-bound parameter list through the generated V1 route", async () => {
    const response = createJsonResponse(projectSnapshotFixture);
    const fetchImplementation = vi.fn().mockResolvedValue(response);
    const request = {
      callableId: "callable:square-root",
      expectedRevision: 2,
      parameters: [
        {
          authoredExpression: "3",
          id: "parameter:square-root:provider",
          name: "x",
        },
        {
          authoredExpression: "2",
          id: "parameter:authored:1",
          name: "scale",
        },
      ],
      projectId: "project:python-canvas",
    };

    await setCallableParameters(request, fetchImplementation as typeof fetch);

    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_PARAMETERS_PATH_V1,
      {
        body: JSON.stringify(request),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
  });

  it("sends the complete revision-bound Python target through the generated V1 route", async () => {
    const response = createJsonResponse(projectSnapshotFixture);
    const fetchImplementation = vi.fn().mockResolvedValue(response);
    // An emptied region is a real proposal, so it crosses this boundary as the empty string.
    const request = {
      expectedRevision: 2,
      prefix: "import math\nimport os",
      projectId: "project:python-canvas",
      suffix: "",
    };

    await setPythonTarget(request, fetchImplementation as typeof fetch);

    expect(fetchImplementation).toHaveBeenCalledWith(PROJECT_TARGET_PATH_V1, {
      body: JSON.stringify(request),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("requests callable completions with the supplied cancellation signal and strictly parsed response", async () => {
    const response = createJsonResponse({
      items: [{ label: "sqrt", insertText: "sqrt" }],
    });
    const fetchImplementation = vi.fn().mockResolvedValue(response);
    const controller = new AbortController();

    await expect(
      completeCallable(
        {
          authoredExpression: "math.sq",
          cursorOffsetUtf16: 7,
          projectId: "project:python-canvas",
          sectionId: "callable:square-root",
        },
        controller.signal,
        fetchImplementation as typeof fetch,
      ),
    ).resolves.toEqual({
      items: [{ label: "sqrt", insertText: "sqrt" }],
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_CALLABLE_COMPLETIONS_PATH_V1,
      {
        body: JSON.stringify({
          authoredExpression: "math.sq",
          cursorOffsetUtf16: 7,
          projectId: "project:python-canvas",
          sectionId: "callable:square-root",
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );
  });

  it("rejects malformed callable completion successes before they reach the editor", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ items: [{ label: "sqrt" }] }));

    await expect(
      completeCallable(
        {
          authoredExpression: "math.sq",
          cursorOffsetUtf16: 7,
          projectId: "project:python-canvas",
          sectionId: "callable:square-root",
        },
        new AbortController().signal,
        fetchImplementation as typeof fetch,
      ),
    ).rejects.toMatchObject({
      kind: "invalid_response",
      status: 200,
    } satisfies Partial<ProjectClientError>);
  });

  it("reports a typed V1 mutation failure", async () => {
    const response = createJsonResponse(
      {
        error: {
          code: "unsupported_signature",
          message: "callable signature is not supported",
        },
      },
      false,
      422,
    );
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await expect(
      commitCallable(
        {
          authoredExpression: "math.sqrt",
          projectId: "project:python-canvas",
          sectionId: "callable:square-root",
        },
        fetchImplementation as typeof fetch,
      ),
    ).rejects.toMatchObject({
      code: "unsupported_signature",
      kind: "http",
      status: 422,
    } satisfies Partial<ProjectClientError>);
  });

  // A parameter ID now travels in the request body rather than in the route, so the route needs no
  // injection guard. What the caller does need is the store's typed conflict.
  it("surfaces a stale revision as its typed conflict code", async () => {
    const response = createJsonResponse(
      {
        error: {
          code: "revision_conflict",
          message: "the project changed since this revision",
        },
      },
      false,
      409,
    );
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await expect(
      setCallableParameters(
        {
          callableId: "callable:square-root",
          expectedRevision: 2,
          parameters: [
            {
              authoredExpression: "3",
              id: "parameter:square-root:provider",
              name: "x",
            },
          ],
          projectId: "project:python-canvas",
        },
        fetchImplementation as typeof fetch,
      ),
    ).rejects.toMatchObject({
      code: "revision_conflict",
      kind: "http",
      status: 409,
    } satisfies Partial<ProjectClientError>);
  });
});

function createJsonResponse(
  body: unknown,
  ok = true,
  status = 200,
): Response & { json: ReturnType<typeof vi.fn> } {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response & { json: ReturnType<typeof vi.fn> };
}
