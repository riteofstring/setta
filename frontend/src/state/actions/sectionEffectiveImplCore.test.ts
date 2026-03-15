import { describe, expect, it } from "vitest";

import {
  createChatSectionImpl,
  createCore,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { getEffectiveImpl } from "./sectionEffectiveImplCore";

describe("getEffectiveImpl", () => {
  it("reuses cached effective objects when impl and modifier refs are unchanged", () => {
    const impl = createChatSectionImpl({
      id: "chat-impl-1",
      type: SectionTypeEnum.Chat,
      inputText: "base",
    });
    const core = createCore({
      id: "section-1",
      sharedModifier: {
        inputText: "shared",
      },
      unsharedKeys: [],
    });
    const variant = createVariant({
      id: "variant-1",
      impl: impl.id,
      modifier: {
        inputText: "variant",
      },
      nonPresetImpls: [impl.id],
    });

    const first = getEffectiveImpl(impl, core, variant);
    const second = getEffectiveImpl(impl, core, variant);

    expect(first).toBe(second);
    expect(first.inputText).toBe("variant");

    variant.modifier = {
      inputText: "updated",
    };
    const third = getEffectiveImpl(impl, core, variant);

    expect(third).not.toBe(first);
    expect(third.inputText).toBe("updated");
  });
});
