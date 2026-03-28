import { ChatWindowPlacementEnum, SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildSectionWindowSurfaceBodyView } from "./sectionWindowSurfaceBodyView";

describe("buildSectionWindowSurfaceBodyView", () => {
  it("treats non-nullish body overrides as authoritative even when they are falsey", () => {
    expect(
      buildSectionWindowSurfaceBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        chatHost: ChatWindowPlacementEnum.floating,
        bodyOverride: 0,
      }),
    ).toEqual({
      kind: "override",
      body: 0,
    });
  });

  it("suppresses the fallback section area when the section is minimized", () => {
    expect(
      buildSectionWindowSurfaceBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: true,
        chatHost: ChatWindowPlacementEnum.floating,
        bodyOverride: null,
      }),
    ).toEqual({
      kind: "none",
    });
  });

  it("builds the window-scoped section area props when there is no override", () => {
    const setProjectChatId = vi.fn();

    expect(
      buildSectionWindowSurfaceBodyView({
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        chatHost: ChatWindowPlacementEnum.floating,
        chatModeOverride: undefined,
        projectChatSurfaceId: "surface-1",
        projectChatId: "chat-1",
        setProjectChatId,
        onProjectChatBlockedErrorCodeChange: vi.fn(),
        bodyOverride: null,
      }),
    ).toMatchObject({
      kind: "area",
      props: {
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Chat,
        bgColor: "bg-setta-50",
        isMinimized: false,
        isUserView: false,
        chatHost: ChatWindowPlacementEnum.floating,
        projectChatSurfaceId: "surface-1",
        projectChatId: "chat-1",
        setProjectChatId,
      },
    });
  });
});
