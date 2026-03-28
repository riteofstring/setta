import { ChatWindowModeEnum, SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildSectionContainerAreaView } from "./sectionContainerAreaView";

describe("buildSectionContainerAreaView", () => {
  it("routes dict sections through the section-container dict-area boundary", () => {
    expect(
      buildSectionContainerAreaView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
        chatHost: "section_layout",
      }),
    ).toEqual({
      kind: "dict",
      props: {
        sectionId: "section-1",
        bgColor: "bg-setta-50",
      },
    });
  });

  it("preserves explicit standalone chat overrides in the routed view", () => {
    const setProjectChatId = vi.fn();

    expect(
      buildSectionContainerAreaView({
        sectionId: "chat-section",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
        chatHost: "standalone_page",
        chatModeOverride: ChatWindowModeEnum.section_mode,
        projectChatId: "thread-1",
        setProjectChatId,
        projectChatSurfaceId: "surface-1",
        onProjectChatBlockedErrorCodeChange: vi.fn(),
      }),
    ).toMatchObject({
      kind: "chat",
      props: {
        sectionId: "chat-section",
        chatHost: "standalone_page",
        chatModeOverride: ChatWindowModeEnum.section_mode,
        projectChatId: "thread-1",
        setProjectChatId,
        projectChatSurfaceId: "surface-1",
      },
    });
  });

  it("returns no routed area for list-root and group container shells", () => {
    expect(
      buildSectionContainerAreaView({
        sectionId: "group-shell",
        sectionTypeName: SectionTypeEnum.Group,
        bgColor: "bg-transparent",
        isMinimized: false,
        isUserView: false,
        chatHost: "section_layout",
      }),
    ).toEqual({ kind: "none" });
  });
});
