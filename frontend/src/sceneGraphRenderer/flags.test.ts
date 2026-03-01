import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_GRAPH_RENDERER_FLAGS,
  SCENE_GRAPH_RENDERER_FLAG_KEYS,
  hasSceneGraphRendererEnabledStorageOverride,
  readSceneGraphRendererFlags,
  readSceneGraphRendererRolloutProjectConfigIds,
  writeSceneGraphRendererFlags,
} from "./flags";

type MemoryStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function createMemoryStorage(
  seed: Record<string, string> = {},
): MemoryStorageAdapter {
  const storage = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
}

describe("scene graph renderer flags", () => {
  it("uses canonical defaults when rollout keys are missing", () => {
    // Verifies Phase 0 rollout starts disabled without pre-existing localStorage flags.
    const flags = readSceneGraphRendererFlags(createMemoryStorage());

    expect(flags).toEqual(DEFAULT_SCENE_GRAPH_RENDERER_FLAGS);
  });

  it("parses explicit localStorage rollout overrides", () => {
    // Validates explicit backend and island radius overrides are read deterministically.
    const flags = readSceneGraphRendererFlags(
      createMemoryStorage({
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled]: "1",
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.backend]: "webgl",
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.domIslandRadius]: "6",
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.debugOverlay]: "true",
      }),
    );

    expect(flags).toEqual({
      enabled: true,
      backend: "webgl",
      domIslandRadius: 6,
      debugOverlay: true,
    });
  });

  it("falls back to safe defaults when persisted values are invalid", () => {
    // Guards against malformed localStorage payloads in older or manually-edited environments.
    const flags = readSceneGraphRendererFlags(
      createMemoryStorage({
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled]: "definitely",
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.backend]: "vulkan",
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.domIslandRadius]: "-3",
        [SCENE_GRAPH_RENDERER_FLAG_KEYS.debugOverlay]: "maybe",
      }),
    );

    expect(flags).toEqual(DEFAULT_SCENE_GRAPH_RENDERER_FLAGS);
  });

  it("writes normalized values back to storage", () => {
    // Ensures write plumbing stores canonical serialized values for e2e/perf harness reads.
    const storage = createMemoryStorage();

    const written = writeSceneGraphRendererFlags(
      {
        enabled: true,
        backend: "webgpu",
        domIslandRadius: 4,
        debugOverlay: true,
      },
      storage,
    );

    expect(written).toEqual({
      enabled: true,
      backend: "webgpu",
      domIslandRadius: 4,
      debugOverlay: true,
    });
    expect(storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled)).toBe("1");
    expect(storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.backend)).toBe(
      "webgpu",
    );
    expect(
      storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.domIslandRadius),
    ).toBe("4");
    expect(storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.debugOverlay)).toBe(
      "1",
    );
  });

  it("detects explicit enabled-key overrides", () => {
    // Controlled default-on logic must distinguish explicit kill-switch values from missing keys.
    expect(
      hasSceneGraphRendererEnabledStorageOverride(createMemoryStorage()),
    ).toBe(false);
    expect(
      hasSceneGraphRendererEnabledStorageOverride(
        createMemoryStorage({
          [SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled]: "0",
        }),
      ),
    ).toBe(true);
  });

  it("parses rollout project config id allowlist as strict json array", () => {
    // Rollout targeting must remain deterministic and typed, not comma-split heuristics.
    expect(
      readSceneGraphRendererRolloutProjectConfigIds(createMemoryStorage()),
    ).toEqual([]);
    expect(
      readSceneGraphRendererRolloutProjectConfigIds(
        createMemoryStorage({
          [SCENE_GRAPH_RENDERER_FLAG_KEYS.rolloutProjectConfigIds]:
            JSON.stringify([" config-a ", "config-b", "config-a", 7]),
        }),
      ),
    ).toEqual(["config-a", "config-b"]);
    expect(
      readSceneGraphRendererRolloutProjectConfigIds(
        createMemoryStorage({
          [SCENE_GRAPH_RENDERER_FLAG_KEYS.rolloutProjectConfigIds]:
            "config-a,config-b",
        }),
      ),
    ).toEqual([]);
  });
});
