import {
  DependencyEventSchema,
  UISettingRevealContentSchema,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated git and websocket support", () => {
  it("validates UISettingReveal payloads with the canonical schema", () => {
    const validResult = UISettingRevealContentSchema.safeParse({
      projectConfigId: "project-1",
      requestId: "request-1",
      reveals: [
        {
          settingId: "setting-1",
          side: "left",
          strategy: "dom_anchor",
          revealActivationSteps: [{ type: "click", itemValue: "setting-1" }],
        },
      ],
    });
    const invalidResult = UISettingRevealContentSchema.safeParse({
      projectConfigId: "project-1",
      requestId: 42,
      reveals: "not-an-array",
    });

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.durationMs).toBe(3000);
      expect(validResult.data.reveals[0]?.revealActivationSteps).toEqual([
        { type: "click", itemValue: "setting-1" },
      ]);
    }
    expect(invalidResult.success).toBe(false);
  });

  it("validates dependency-event payloads with the canonical schema", () => {
    const validResult = DependencyEventSchema.safeParse({
      dependencyKey: {
        type: "Section",
        sectionId: "section-1",
      },
      payload: null,
      timestampMs: 1,
    });
    const invalidResult = DependencyEventSchema.safeParse({
      payload: null,
      timestampMs: "bad",
    });

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.timestampMs).toBe(1);
      expect(validResult.data.payload).toBeNull();
    }
    expect(invalidResult.success).toBe(false);
  });
});
