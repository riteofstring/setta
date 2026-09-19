import { describe, expect, it, vi } from "vitest";

import { lensTestSnapshot } from "../test/lensTestData";
import type { LensMutation, MutationResult } from "./generatedContract";
import {
  LENS_APPLY_PATH,
  LENS_EVENTS_PATH,
  LENS_PATH,
  LensClientError,
  applyLensMutation,
  fetchLensSnapshot,
  subscribeLensSnapshots,
  type LensEventSource,
} from "./client";

function mutation(): LensMutation {
  const snapshot = lensTestSnapshot();
  return {
    expectedRevision: snapshot.revision,
    experimentId: snapshot.experiment.id,
    manifestSha256: snapshot.manifestSha256,
    observationSourceSha256: snapshot.observationSourceSha256,
    selection: {
      ...snapshot.selection,
      selectedObservationIds: ["observation-a"],
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function eventSource(): LensEventSource & {
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

describe("Experiment Lens client boundary", () => {
  it("gets and validates the authoritative snapshot", async () => {
    const snapshot = lensTestSnapshot();
    const fetchImplementation = vi.fn(async () => jsonResponse(snapshot));

    await expect(
      fetchLensSnapshot(fetchImplementation as unknown as typeof fetch),
    ).resolves.toEqual(snapshot);
    expect(fetchImplementation).toHaveBeenCalledWith(LENS_PATH, {
      headers: { Accept: "application/json" },
      method: "GET",
    });
  });

  it("sends one complete digest- and revision-bound replacement", async () => {
    const command = mutation();
    const next = {
      ...lensTestSnapshot(),
      revision: command.expectedRevision + 1,
      selection: command.selection,
    };
    const result: MutationResult = { snapshot: next, version: 1 };
    const fetchImplementation = vi.fn(async () => jsonResponse(result));

    await expect(
      applyLensMutation(
        command,
        fetchImplementation as unknown as typeof fetch,
      ),
    ).resolves.toEqual(result);
    expect(fetchImplementation).toHaveBeenCalledWith(LENS_APPLY_PATH, {
      body: JSON.stringify(command),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("rejects a mutation response for a different observation source", async () => {
    const command = mutation();
    const result = {
      snapshot: {
        ...lensTestSnapshot(),
        observationSourceSha256: "d".repeat(64),
        revision: command.expectedRevision + 1,
      },
      version: 1,
    };
    const fetchImplementation = vi.fn(async () => jsonResponse(result));

    await expect(
      applyLensMutation(
        command,
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      kind: "invalid-response",
    } satisfies Partial<LensClientError>);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("accepts named snapshot events and closes on invalid data", () => {
    const source = eventSource();
    const onInvalid = vi.fn();
    const onSnapshot = vi.fn();
    const disconnect = subscribeLensSnapshots(
      { onInvalid, onSnapshot },
      (path) => {
        expect(path).toBe(LENS_EVENTS_PATH);
        return source;
      },
    );

    source.dispatch(
      "snapshot",
      new MessageEvent("snapshot", {
        data: JSON.stringify(lensTestSnapshot()),
      }),
    );
    expect(onSnapshot).toHaveBeenCalledOnce();
    source.dispatch("snapshot", new MessageEvent("snapshot", { data: "{}" }));
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(source.close).toHaveBeenCalledOnce();
    disconnect();
  });
});
