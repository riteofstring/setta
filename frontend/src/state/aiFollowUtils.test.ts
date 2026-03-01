import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getAllowedChatIdsForProject,
  getSectionIdsForProject,
  hasSectionIdInProject,
} from "./aiFollowUtils";

const PROJECT_ID = "project-1";
const CHAT_A = "chat-a";
const CHAT_B = "chat-b";
const SECTION_A = "section-a";
const SECTION_B = "section-b";
const SECTION_C = "section-c";
const VARIANT_A = "variant-a";
const VARIANT_B = "variant-b";
const VARIANT_C = "variant-c";
const IMPL_A = "impl-a";
const IMPL_B = "impl-b";
const IMPL_C = "impl-c";

const IDS_BY_PROJECT = {
  [PROJECT_ID]: {
    [CHAT_A]: { section: ["s1", "s2"] },
    [CHAT_B]: { section: ["s2", "s3"] },
  },
};

const SECTION_VARIANT_MAP = {
  [SECTION_A]: VARIANT_A,
  [SECTION_B]: VARIANT_B,
  [SECTION_C]: VARIANT_C,
};

const SECTION_VARIANTS = {
  [VARIANT_A]: { impl: IMPL_A },
  [VARIANT_B]: { impl: IMPL_B },
  [VARIANT_C]: { impl: IMPL_C },
};

const SECTION_IMPLS = {
  [IMPL_A]: { type: SectionTypeEnum.Chat, chatId: CHAT_A },
  [IMPL_B]: { type: SectionTypeEnum.Code, chatId: CHAT_B },
  [IMPL_C]: { type: SectionTypeEnum.Chat, chatId: null },
};

describe("aiFollowUtils", () => {
  it("returns allowed chat ids based on mode", () => {
    const off = getAllowedChatIdsForProject(
      "off",
      {},
      {},
      PROJECT_ID,
      SECTION_VARIANT_MAP,
      SECTION_VARIANTS,
      SECTION_IMPLS,
    );
    expect(off).not.toBeNull();
    expect(Array.from(off ?? [])).toEqual([]);

    const all = getAllowedChatIdsForProject(
      "all",
      {},
      {},
      PROJECT_ID,
      SECTION_VARIANT_MAP,
      SECTION_VARIANTS,
      SECTION_IMPLS,
    );
    expect(all).toBeNull();

    const selected = getAllowedChatIdsForProject(
      "selected",
      { [PROJECT_ID]: [CHAT_B] },
      { [PROJECT_ID]: [SECTION_A, SECTION_C] },
      PROJECT_ID,
      SECTION_VARIANT_MAP,
      SECTION_VARIANTS,
      SECTION_IMPLS,
    );
    expect(Array.from(selected ?? []).sort()).toEqual([CHAT_A, CHAT_B]);
  });

  it("ignores selected chat sections without chat ids", () => {
    const selected = getAllowedChatIdsForProject(
      "selected",
      {},
      { [PROJECT_ID]: [SECTION_C] },
      PROJECT_ID,
      SECTION_VARIANT_MAP,
      SECTION_VARIANTS,
      SECTION_IMPLS,
    );
    expect(Array.from(selected ?? [])).toEqual([]);
  });

  it("filters section ids by allowed chat ids", () => {
    const all = getSectionIdsForProject(IDS_BY_PROJECT, PROJECT_ID, null);
    expect(all.sort()).toEqual(["s1", "s2", "s3"]);

    const onlyChatB = getSectionIdsForProject(
      IDS_BY_PROJECT,
      PROJECT_ID,
      new Set([CHAT_B]),
    );
    expect(onlyChatB.sort()).toEqual(["s2", "s3"]);

    const none = getSectionIdsForProject(IDS_BY_PROJECT, PROJECT_ID, new Set());
    expect(none).toEqual([]);
  });

  it("keeps follow filtering disabled until the user opts in", () => {
    const allowedWhileOff = getAllowedChatIdsForProject(
      "off",
      { [PROJECT_ID]: [CHAT_A] },
      { [PROJECT_ID]: [SECTION_A] },
      PROJECT_ID,
      SECTION_VARIANT_MAP,
      SECTION_VARIANTS,
      SECTION_IMPLS,
    );

    expect(Array.from(allowedWhileOff ?? [])).toEqual([]);
    expect(
      getSectionIdsForProject(IDS_BY_PROJECT, PROJECT_ID, allowedWhileOff),
    ).toEqual([]);
  });

  it("checks section membership against allowed chat ids", () => {
    const all = hasSectionIdInProject(IDS_BY_PROJECT, PROJECT_ID, "s1", null);
    expect(all).toBe(true);

    const onlyChatB = hasSectionIdInProject(
      IDS_BY_PROJECT,
      PROJECT_ID,
      "s1",
      new Set([CHAT_B]),
    );
    expect(onlyChatB).toBe(false);
  });
});
