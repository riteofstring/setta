import { describe, expect, it, vi } from "vitest";

import { projectDraft } from "../app/benchContext";
import { makeBenchSnapshot } from "../testSnapshot";
import {
  BenchClientError,
  connectSnapshotEvents,
  fetchSnapshot,
  replaceProject,
  SNAPSHOT_EVENTS_PATH,
  type SnapshotEventSource,
} from "./client";

function jsonFetch(value: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      ({
        json: async () => value,
        ok: status >= 200 && status < 300,
        status,
      }) as Response,
  ) as unknown as typeof fetch;
}

describe("Bench client", () => {
  it("validates snapshots before exposing them to the application", async () => {
    const snapshot = makeBenchSnapshot();
    await expect(fetchSnapshot(jsonFetch(snapshot))).resolves.toEqual(snapshot);

    const invalid = { ...snapshot, version: "bench-snapshot/v0" };
    await expect(fetchSnapshot(jsonFetch(invalid))).rejects.toMatchObject({
      kind: "invalid-response",
    } satisfies Partial<BenchClientError>);
  });

  it("sends an optimistic whole-project replacement and validates the result", async () => {
    const snapshot = makeBenchSnapshot();
    const nextProject = { ...snapshot.project, revision: 4 };
    const fetchImplementation = jsonFetch(nextProject);

    await expect(
      replaceProject(
        snapshot.project,
        projectDraft(snapshot.project),
        fetchImplementation,
      ),
    ).resolves.toEqual(nextProject);
    const [, init] = vi.mocked(fetchImplementation).mock.calls[0]!;
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      expectedRevision: 3,
      projectId: "product-thumbnails",
    });
  });

  it("accepts complete SSE snapshots and closes on invalid data", () => {
    const onSnapshot = vi.fn();
    const onInvalid = vi.fn();
    const source: SnapshotEventSource = {
      close: vi.fn(),
      onerror: null,
      onmessage: null,
    };
    let openedPath = "";
    const disconnect = connectSnapshotEvents(
      { onInvalid, onSnapshot },
      (path) => {
        openedPath = path;
        return source;
      },
    );

    source.onmessage?.call(
      {} as EventSource,
      {
        data: JSON.stringify(makeBenchSnapshot()),
      } as MessageEvent<string>,
    );
    expect(openedPath).toBe(SNAPSHOT_EVENTS_PATH);
    expect(onSnapshot).toHaveBeenCalledOnce();

    source.onmessage?.call(
      {} as EventSource,
      {
        data: "{}",
      } as MessageEvent<string>,
    );
    expect(source.close).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledOnce();
    disconnect();
    expect(source.close).toHaveBeenCalledTimes(2);
  });
});
