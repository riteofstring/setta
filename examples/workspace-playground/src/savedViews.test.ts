import {
  activateWorkspaceSavedView,
  createWorkspaceHost,
  getWorkspaceSavedViewsState,
} from "@setta/workspace";
import { describe, expect, it } from "vitest";

import { performanceProfileDocument } from "./performanceProfileDocument";
import { playgroundDocument } from "./playgroundDocument";
import { registerPlaygroundSectionKinds } from "./sectionKinds";

describe("playground saved views", () => {
  it("seeds distinct Overview, Content, and Controls presentations", () => {
    const host = createWorkspaceHost();
    registerPlaygroundSectionKinds(host);
    host.loadDocument(playgroundDocument);

    expect(getWorkspaceSavedViewsState(host)).toMatchObject({
      activeViewId: "overview",
      views: {
        overview: { isTab: true, name: "Overview", sortIndex: 0 },
        content: { isTab: true, name: "Content", sortIndex: 1 },
        controls: { isTab: true, name: "Controls", sortIndex: 2 },
      },
    });

    activateWorkspaceSavedView(host, "content");

    expect(getWorkspaceSavedViewsState(host)).toMatchObject({
      activeViewId: "content",
      views: {
        content: {
          sectionVisibility: {
            "code-editor": true,
            "meta-dropdown": false,
          },
          topLevelSections: {
            "item-panel": { x: 24, y: 24 },
          },
        },
      },
    });
    expect(host.getSnapshot().topLevelSections["item-panel"]).toMatchObject({
      x: 24,
      y: 24,
    });

    activateWorkspaceSavedView(host, "controls");

    expect(getWorkspaceSavedViewsState(host)).toMatchObject({
      activeViewId: "controls",
      views: {
        controls: {
          sectionVisibility: {
            "code-editor": false,
            "meta-dropdown": true,
          },
          topLevelSections: {
            "meta-dropdown": { x: 24, y: 24 },
          },
        },
      },
    });
    host.dispose();
  });

  it("leaves the large-document performance fixture outside saved views", () => {
    expect(performanceProfileDocument.savedViews).toBeNull();
  });
});
