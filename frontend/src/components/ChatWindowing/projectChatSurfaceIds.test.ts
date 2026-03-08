import { describe, expect, it } from "vitest";
import {
  buildStandalonePageProjectChatSurfaceId,
  buildStandalonePageSectionProjectChatSurfaceId,
  buildStandaloneWindowSpaceProjectChatSurfaceId,
  buildWorkspaceProjectChatWindowSurfaceId,
  buildWorkspaceSectionProjectChatSurfaceId,
} from "./projectChatSurfaceIds";

describe("projectChatSurfaceIds", () => {
  it("namespaces workspace and standalone window-space window ids separately", () => {
    expect(
      buildWorkspaceProjectChatWindowSurfaceId("project-chat-window-1"),
    ).toBe("workspace:project-chat-window-1");
    expect(
      buildStandaloneWindowSpaceProjectChatSurfaceId(
        "saved-layout-1",
        "project-chat-window-1",
      ),
    ).toBe("standalone-window-space:saved-layout-1:project-chat-window-1");
  });

  it("builds deterministic section and standalone route surface ids", () => {
    expect(buildWorkspaceSectionProjectChatSurfaceId("section-1")).toBe(
      "workspace-section:section-1",
    );
    expect(buildStandalonePageProjectChatSurfaceId()).toBe(
      "standalone-page:project-chat",
    );
    expect(buildStandalonePageSectionProjectChatSurfaceId("section-1")).toBe(
      "standalone-page:section:section-1",
    );
  });
});
