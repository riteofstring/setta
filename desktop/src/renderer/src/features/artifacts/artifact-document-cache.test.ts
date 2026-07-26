import type { Artifact, WorkstreamArtifact } from "@generated/backend";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArtifactDocumentCache } from "./artifact-document-cache";

const metadata: WorkstreamArtifact = {
  conversationId: "conversation-1",
  createdAt: "2026-07-26T12:00:00Z",
  id: "artifact-1",
  runId: "run-1",
  sourceEventIds: ["event-1"],
  status: "available",
  title: "Run summary",
  updatedAt: "2026-07-26T12:00:00Z",
  workspaceId: "workspace-1",
  workstreamId: "workstream-1",
};

const artifact: Artifact = {
  conversationId: metadata.conversationId,
  createdAt: metadata.createdAt,
  document: {
    catalogId: "setta.artifacts.v1",
    language: "openui_lang",
    source: 'root = Document([Text("Ready")])',
  },
  id: metadata.id,
  title: metadata.title,
  trajectorySequence: 1,
  turnId: metadata.runId,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ArtifactDocumentCache", () => {
  it("retries one transient read and reuses the resulting entry", async () => {
    const readArtifact = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary read failure"))
      .mockResolvedValueOnce(artifact);
    const cache = new ArtifactDocumentCache({ readArtifact });

    const loaded = await cache.load(metadata);

    expect(loaded.artifact).toBe(artifact);
    expect(readArtifact).toHaveBeenCalledTimes(2);
    await expect(cache.load(metadata)).resolves.toBe(loaded);
    expect(readArtifact).toHaveBeenCalledTimes(2);
  });

  it("validates every caller while sharing an in-flight read", async () => {
    let resolveRead: ((value: Artifact) => void) | undefined;
    const readArtifact = vi.fn(
      () =>
        new Promise<Artifact>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const cache = new ArtifactDocumentCache({ readArtifact });
    const mismatched = { ...metadata, title: "Another artifact" };
    const telemetry = vi.spyOn(console, "error").mockImplementation(() => {});

    const accepted = cache.load(metadata);
    const rejected = cache.load(mismatched);
    resolveRead?.(artifact);

    await expect(accepted).resolves.toMatchObject({ artifact });
    await expect(rejected).rejects.toThrow(/does not match Director record/u);
    expect(readArtifact).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalledWith(expect.stringContaining('"stage":"identity"'));
  });

  it("does not let a prefetched cache entry bypass later identity matching", async () => {
    const readArtifact = vi.fn().mockResolvedValue(artifact);
    const cache = new ArtifactDocumentCache({ readArtifact });
    const telemetry = vi.spyOn(console, "error").mockImplementation(() => {});

    await cache.load(metadata);

    expect(() => cache.peek({ ...metadata, runId: "different-run" })).toThrow(
      /does not match Director record/u,
    );
    await expect(cache.load({ ...metadata, runId: "different-run" })).rejects.toThrow(
      /does not match Director record/u,
    );
    expect(readArtifact).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalled();
  });

  it("evicts the oldest entry at its document bound", async () => {
    const records = [1, 2, 3].map((index) => {
      const currentMetadata = {
        ...metadata,
        id: `artifact-${index}`,
        runId: `run-${index}`,
        title: `Run summary ${index}`,
      };
      return {
        artifact: {
          ...artifact,
          id: currentMetadata.id,
          title: currentMetadata.title,
          turnId: currentMetadata.runId,
        },
        metadata: currentMetadata,
      };
    });
    const artifactsById = new Map(records.map((record) => [record.artifact.id, record.artifact]));
    const cache = new ArtifactDocumentCache({
      limit: 2,
      readArtifact: async (request) => {
        const current = artifactsById.get(request.artifactId);
        if (current === undefined) {
          throw new Error(`unexpected artifact ${request.artifactId}`);
        }
        return current;
      },
    });

    for (const record of records) {
      await cache.load(record.metadata);
    }

    expect(cache.peek(records[0]!.metadata)).toBeUndefined();
    expect(cache.peek(records[1]!.metadata)).toBeDefined();
    expect(cache.peek(records[2]!.metadata)).toBeDefined();
  });
});
