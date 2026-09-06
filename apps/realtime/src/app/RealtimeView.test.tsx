import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Realtime workspace presentation", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1200, 800),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the normal editable Workspace shell", async () => {
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
      reload: vi.fn(async () => true),
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

    expect(
      element.querySelector('[data-workspace-shell="true"]'),
    ).not.toBeNull();
    expect(element.querySelector(".realtime-app-header")).toBeNull();
    expect(element.querySelector(".realtime-app-chrome")).toBeNull();
    expect(
      element.querySelector(
        '[data-workspace-shell-pane-region="trailing"] .realtime-runtime-pane-controls',
      ),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-section-id="input-main"]')?.textContent,
    ).toContain("Prompt");
    expect(element.querySelector(".realtime-use-viewport")).toBeNull();
    expect(element.textContent).not.toContain("Author");
    expect(
      element.querySelector('[aria-label="Presentation mode"]'),
    ).toBeNull();
    const lock = element.querySelector<HTMLButtonElement>(
      '[data-section-id="input-main"] [aria-label="Lock position and size"]',
    );
    const remove = element.querySelector<HTMLButtonElement>(
      '[data-section-id="input-main"] [aria-label="Delete section"]',
    );
    expect(lock?.disabled).toBe(false);
    expect(remove?.disabled).toBe(false);
    await act(async () => lock?.click());
    expect(
      host.getSnapshot().sections["input-main"]?.positionAndSizeLocked,
    ).toBe(true);
    const minimize = element.querySelector<HTMLButtonElement>(
      '[data-section-id="input-main"] [aria-label="Minimize section"]',
    );
    await act(async () => minimize?.click());
    expect(host.getSnapshot().sections["input-main"]?.isMinimized).toBe(true);
    await act(async () =>
      element
        .querySelector<HTMLElement>('[data-section-id="input-main"]')
        ?.click(),
    );
    expect(host.getSnapshot().activeIds).toEqual(["input-main"]);

    await act(async () => root.unmount());
    host.dispose();
    element.remove();
  });

  it("renders lifecycle outcomes and reloads while invocation stays disabled", async () => {
    const project = makeProject();
    project.sections = {
      "button-main": project.sections["button-main"]!,
      "status-main": project.sections["status-main"]!,
    };
    project.layout.topLevelSections = {
      "button-main": project.layout.topLevelSections["button-main"]!,
      "status-main": project.layout.topLevelSections["status-main"]!,
    };
    project.bindings[0]!.outputs = {
      status: { field: "message", sectionId: "status-main" },
    };
    const host = createWorkspaceHost();
    const catalog = createRealtimeSectionKinds();
    registerRealtimeSectionKinds(host, catalog);
    host.loadDocument(projectWorkspaceDocument(project));
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const reload = vi.fn(async () => true);
    const actions: RealtimeActions = {
      cancel: vi.fn(() => true),
      commitSectionData: vi.fn(async () => true),
      emit: vi.fn(() => true),
      reload,
      reportError: vi.fn(),
      uploadContent: vi.fn(async () => ({
        byteLength: 0,
        id: "unused-content",
        invocationId: "unused-invocation",
        mediaType: "image/png",
        sha256: "0".repeat(64),
      })),
    };
    const runtime = {
      ...initialRuntimeViewState,
      connection: "connected" as const,
      error: { code: "runtime_failure", message: "Runtime unavailable" },
      invocations: {
        "binding-main": {
          error: { code: "handler_failure", message: "Handler exploded" },
          identity: {
            bindingId: "binding-main",
            invocationId: "invocation-main",
            sequence: 2,
            sessionId: "session-main",
          },
          state: "failed" as const,
        },
      },
      latestByBinding: {},
      logs: [{ stream: "stderr" as const, text: "trace line" }],
      sessionId: "session-main",
      workerState: "failed",
    };

    await act(async () => {
      root.render(
        <RealtimeView
          actions={actions}
          error="Transport warning"
          host={host}
          project={project}
          runtime={runtime}
        />,
      );
    });

    expect(element.textContent).toContain("Worker: failed");
    expect(
      element.querySelector('[data-worker-state="failed"]'),
    ).not.toBeNull();
    expect(element.textContent).toContain("Runtime unavailable");
    expect(element.textContent).toContain("Handler exploded");
    expect(element.textContent).toContain("Runtime logs (1)");
    expect(
      element.querySelector(
        '[data-workspace-shell-pane-region="trailing"] [aria-label="Runtime activity"]',
      ),
    ).not.toBeNull();
    expect(
      element.querySelector(".realtime-action")?.hasAttribute("disabled"),
    ).toBe(true);
    const reloadButton = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent === "Reload runtime",
    );
    expect(reloadButton?.hasAttribute("disabled")).toBe(false);
    await act(async () => reloadButton?.click());
    expect(reload).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    host.dispose();
    element.remove();
  });
});
