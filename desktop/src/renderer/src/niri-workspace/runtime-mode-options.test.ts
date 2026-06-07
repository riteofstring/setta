import { describe, expect, test } from "vitest";

import {
  presentationOptionsForRuntime,
  runtimePolicyOptionsForRuntime,
} from "./runtime-mode-options";
import type { NiriSceneMode } from "./runtime-mode-options";

describe("niri runtime mode options", () => {
  test.each(["benchmark", "workspace"] satisfies NiriSceneMode[])(
    "disables sync-all content updates during movement for %s mode",
    (mode) => {
      expect(presentationOptionsForRuntime(mode)).toStrictEqual({
        syncAllRenderedContentDuringMovement: false,
      });
    },
  );

  test("keeps benchmark overview degradation for the synthetic stress scene", () => {
    expect(runtimePolicyOptionsForRuntime("benchmark")).toStrictEqual({
      degradeDuringMovement: true,
      degradeOverview: true,
    });
  });

  test("keeps workspace movement live while using snapshots in overview", () => {
    expect(runtimePolicyOptionsForRuntime("workspace")).toStrictEqual({
      degradeDuringMovement: false,
      degradeOverview: true,
    });
  });
});
