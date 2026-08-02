import { describe, expect, it } from "vitest";
import {
  buildOverviewProjectChatSurfaceId,
  buildStandalonePageProjectChatSurfaceId,
  buildStandalonePageSectionProjectChatSurfaceId,
  buildStandaloneWindowSpaceProjectChatSurfaceId,
  buildWorkspaceProjectChatWindowSurfaceId,
  buildWorkspaceSectionProjectChatSurfaceId,
} from "./projectChatSurfaceIds";

describe("projectChatSurfaceIds", () => {
  it("namespaces workspace and standalone window-space window ids separately", () => {
    expect(
      buildWorkspaceProjectChatWindowSurfaceId(
        "project-a",
        "project-chat-window-1",
      ),
    ).toBe("workspace:project-a:project-chat-window-1");
    expect(
      buildStandaloneWindowSpaceProjectChatSurfaceId(
        "project-a",
        "saved-layout-1",
        "project-chat-window-1",
      ),
    ).toBe(
      "standalone-window-space:project-a:saved-layout-1:project-chat-window-1",
    );
  });

  it("builds deterministic section and standalone route surface ids", () => {
    expect(buildOverviewProjectChatSurfaceId("project-a")).toBe(
      "overview:project-a:project-chat",
    );
    expect(
      buildWorkspaceSectionProjectChatSurfaceId("project-a", "section-1"),
    ).toBe("workspace-section:project-a:section-1");
    expect(buildStandalonePageProjectChatSurfaceId("project-a")).toBe(
      "standalone-page:project-a:project-chat",
    );
    expect(
      buildStandalonePageSectionProjectChatSurfaceId("project-a", "section-1"),
    ).toBe("standalone-page:project-a:section:section-1");
  });

  it("keeps otherwise identical local ids isolated across project configs", () => {
    expect(buildOverviewProjectChatSurfaceId("project-a")).not.toBe(
      buildOverviewProjectChatSurfaceId("project-b"),
    );
    expect(
      buildWorkspaceProjectChatWindowSurfaceId(
        "project-a",
        "project-chat-window-1",
      ),
    ).not.toBe(
      buildWorkspaceProjectChatWindowSurfaceId(
        "project-b",
        "project-chat-window-1",
      ),
    );
    expect(buildStandalonePageProjectChatSurfaceId("project-a")).not.toBe(
      buildStandalonePageProjectChatSurfaceId("project-b"),
    );
    expect(
      buildStandaloneWindowSpaceProjectChatSurfaceId(
        "project-a",
        "saved-layout-1",
        "project-chat-window-1",
      ),
    ).not.toBe(
      buildStandaloneWindowSpaceProjectChatSurfaceId(
        "project-b",
        "saved-layout-1",
        "project-chat-window-1",
      ),
    );
  });
});
