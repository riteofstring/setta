import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, it, vi } from "vitest";

import {
  PROJECT_CALLABLE_PATH_V1,
  PROJECT_PARAMETER_PATH_V1,
  PROJECT_PATH_V1,
} from "./generatedContract";
import {
  ProjectClientError,
  commitCallable,
  fetchProjectSnapshot,
  setParameterExpression,
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

    expect(fetchImplementation).toHaveBeenCalledWith(
      PROJECT_CALLABLE_PATH_V1,
      {
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
      },
    );
  });

  it("sets the exact stable parameter ID through the generated V1 route", async () => {
    const response = createJsonResponse(projectSnapshotFixture);
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await setParameterExpression(
      {
        authoredExpression: "3",
        parameterId: "parameter:square-root:1",
        projectId: "project:python-canvas",
      },
      fetchImplementation as typeof fetch,
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      `${PROJECT_PARAMETER_PATH_V1}parameter:square-root:1`,
      {
        body: JSON.stringify({
          authoredExpression: "3",
          projectId: "project:python-canvas",
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
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

  it("rejects unsafe parameter IDs before issuing a request", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      setParameterExpression(
        {
          authoredExpression: "3",
          parameterId: "parameter/other",
          projectId: "project:python-canvas",
        },
        fetchImplementation as typeof fetch,
      ),
    ).rejects.toMatchObject({ kind: "invalid_response" });

    expect(fetchImplementation).not.toHaveBeenCalled();
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
