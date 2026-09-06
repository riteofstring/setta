import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceHost,
  type WorkspaceSectionData,
} from "@setta/workspace";

import { makeProject } from "../testProject";
import { projectWorkspaceDocument } from "./projectProjection";
import {
  createRealtimeSectionKinds,
  registerRealtimeSectionKinds,
} from "./realtimeSectionKinds";
import type { RealtimeActions } from "./runtimeContext";
import { initialRuntimeViewState } from "./runtimeState";
import { RealtimeView } from "./RealtimeView";

describe("Realtime use presentation", () => {
  it("opens in a use-focused surface with the authored layout and no authoring shell", async () => {
    window.history.replaceState({}, "", "/?mode=use");
    const project = makeProject();
    project.sections = { "input-main": project.sections["input-main"]! };
    project.layout.topLevelSections = {
      "input-main": project.layout.topLevelSections["input-main"]!,
    };
    project.bindings = [];
    const host = createWorkspaceHost();
    const catalog = createRealtimeSectionKinds();
    registerRealtimeSectionKinds(host, catalog);
    host.loadDocument(projectWorkspaceDocument(project));
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const actions: RealtimeActions = {
      cancel: vi.fn(() => true),
      commitSectionData: vi.fn(
        async (_sectionId: string, _data: WorkspaceSectionData) => true,
      ),
      emit: vi.fn(() => true),
      reportError: vi.fn(),
      uploadContent: vi.fn(async () => ({
        byteLength: 0,
        id: "unused-content",
        invocationId: "unused-invocation",
        mediaType: "image/png",
        sha256: "0".repeat(64),
      })),
    };

    await act(async () => {
      root.render(
        <RealtimeView
          actions={actions}
          catalog={catalog}
          error={null}
          host={host}
          project={project}
          runtime={{
            ...initialRuntimeViewState,
            connection: "connected",
            sessionId: "session-main",
            workerState: "ready",
          }}
        />,
      );
    });

    expect(element.querySelector(".realtime-use-viewport")).not.toBeNull();
    expect(element.querySelector(".realtime-use-plane")?.textContent).toContain(
      "Prompt",
    );
    expect(element.querySelector(".workspace-shell")).toBeNull();
    expect(
      element.querySelector<HTMLElement>(".realtime-use-plane > div")?.style
        .left,
    ).toBe("288px");

    await act(async () => root.unmount());
    host.dispose();
    element.remove();
  });
});
