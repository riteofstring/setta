import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_CODE_SECTION_KIND,
  WorkspaceProvider,
  createWorkspaceCodeSectionData,
  createWorkspaceHost,
  type WorkspaceHost,
  type WorkspaceSection,
} from "@setta/workspace";

import { RealtimeContext, type RealtimeActions } from "../app/runtimeContext";
import { initialRuntimeViewState } from "../app/runtimeState";
import { makeProject } from "../testProject";
import { EntrypointCodeControl } from "./EntrypointCodeControl";

function makeSection(
  code: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    children: [],
    data: createWorkspaceCodeSectionData({ code, language: "python" }),
    id: "code-main",
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: WORKSPACE_CODE_SECTION_KIND,
    name: "main.py",
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 420, width: 560 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

describe("entrypoint code header control", () => {
  let element: HTMLDivElement;
  let host: WorkspaceHost;
  let root: Root;
  const applyRuntimeSource = vi.fn(async () => true);
  const actions: RealtimeActions = {
    applyRuntimeSource,
    cancel: vi.fn(() => true),
    connectGraph: vi.fn(async () => true),
    commitSectionData: vi.fn(async () => true),
    emit: vi.fn(() => true),
    createHandler: vi.fn(async () => true),
    deleteGraphEdges: vi.fn(async () => true),
    initialize: vi.fn(async () => true),
    reload: vi.fn(async () => true),
    reconnectGraph: vi.fn(async () => true),
    reportError: vi.fn(),
    uploadContent: vi.fn(async () => ({
      byteLength: 0,
      id: "unused",
      invocationId: "unused",
      mediaType: "image/png",
      sha256: "0".repeat(64),
    })),
    updateBinding: vi.fn(async () => true),
  };
  const project = makeProject();
  const document = {
    entrypoint: "main.py",
    projectId: "project-main",
    source: "saved\n",
    version: "a".repeat(64),
  };

  beforeEach(() => {
    applyRuntimeSource.mockClear();
    host = createWorkspaceHost();
    element = window.document.createElement("div");
    window.document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    host.dispose();
  });

  async function render(
    section: WorkspaceSection,
    source: {
      activationRejected: boolean;
      status: "ready" | "applying";
    },
  ) {
    await act(async () => {
      root.render(
        <RealtimeContext.Provider
          value={{
            actions,
            error: null,
            project,
            runtime: {
              ...initialRuntimeViewState,
              connection: "disconnected",
              workerState: "failed",
            },
            source: {
              ...source,
              document,
              notice: null,
            },
          }}
        >
          <WorkspaceProvider host={host}>
            <EntrypointCodeControl section={section} />
          </WorkspaceProvider>
        </RealtimeContext.Provider>,
      );
    });
    return element.querySelector<HTMLButtonElement>("button")!;
  }

  it("applies a dirty draft even when the failed runtime socket is disconnected", async () => {
    const button = await render(makeSection("draft\n"), {
      activationRejected: false,
      status: "ready",
    });
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Apply & reload");
    expect(button.title).toContain("Ctrl/⌘+Enter");
    expect(button.className).toContain("text-setta-600");
    expect(button.textContent).toBe("Apply");
    expect(
      button.querySelector('[data-runtime-source-action-icon="play"]'),
    ).not.toBeNull();

    await act(async () => button.click());
    expect(applyRuntimeSource).toHaveBeenCalledWith("code-main", "draft\n");
  });

  it("disables a clean draft unless the saved activation was rejected", async () => {
    let button = await render(makeSection("saved\n"), {
      activationRejected: false,
      status: "ready",
    });
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(applyRuntimeSource).not.toHaveBeenCalled();

    button = await render(makeSection("saved\n"), {
      activationRejected: true,
      status: "ready",
    });
    expect(button.disabled).toBe(false);
  });

  it("disables applying, locked, and read-only drafts", async () => {
    let button = await render(makeSection("draft\n"), {
      activationRejected: false,
      status: "applying",
    });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toBe("Applying…");
    expect(
      button.querySelector('[data-runtime-source-action-icon="busy"]'),
    ).not.toBeNull();

    button = await render(
      makeSection("draft\n", { positionAndSizeLocked: true }),
      { activationRejected: false, status: "ready" },
    );
    expect(button.disabled).toBe(true);

    button = await render(
      makeSection("draft\n", {
        data: createWorkspaceCodeSectionData({
          code: "draft\n",
          mode: "read-only",
        }),
        styleColor: "blue",
      }),
      { activationRejected: false, status: "ready" },
    );
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("var(--setta-section-style-muted-text)");
  });
});
