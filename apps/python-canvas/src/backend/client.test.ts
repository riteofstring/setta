import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, it, vi } from "vitest";

import { PROJECT_PATH_V1 } from "./generatedContract";
import { ProjectClientError, fetchProjectSnapshot } from "./client";

describe("fetchProjectSnapshot", () => {
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
    expect(response.json).toHaveBeenCalledTimes(1);
  });

  it("throws a typed error for a non-success response without parsing it", async () => {
    const response = createJsonResponse({ error: "unavailable" }, false, 503);
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await expect(
      fetchProjectSnapshot(fetchImplementation as typeof fetch),
    ).rejects.toMatchObject({
      kind: "http",
      status: 503,
    } satisfies Partial<ProjectClientError>);

    expect(response.json).not.toHaveBeenCalled();
  });

  it("throws a typed error when a successful response is not a valid V1 snapshot", async () => {
    const response = createJsonResponse({
      ...projectSnapshotFixture,
      version: "v2",
    });
    const fetchImplementation = vi.fn().mockResolvedValue(response);
    let error: unknown;

    try {
      await fetchProjectSnapshot(fetchImplementation as typeof fetch);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ProjectClientError);
    expect(error).toMatchObject({ kind: "invalid_response", status: 200 });
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
