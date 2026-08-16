/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost, WorkspaceTestProvider } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import { useSectionRefs } from "../section/sectionRefs";
import {
  focusWorkspaceScope,
  getWorkspaceFocusScopeId,
  useWorkspaceFocusScope,
  type WorkspaceFocusScopeId,
} from "./workspaceFocusScopes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function ScopeHost({
  scopeIds,
}: {
  scopeIds: ReadonlyArray<WorkspaceFocusScopeId>;
}) {
  return (
    <>
      {scopeIds.map((scopeId) => (
        <ScopeRoot key={scopeId} scopeId={scopeId} />
      ))}
    </>
  );
}

function ScopeRoot({ scopeId }: { scopeId: WorkspaceFocusScopeId }) {
  const ref = useRef<HTMLDivElement>(null);
  useWorkspaceFocusScope(scopeId, ref);
  return <div data-scope-root={scopeId} ref={ref} />;
}

function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing test element ${selector}.`);
  }
  return element;
}

function appendButton(parent: HTMLElement, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  parent.appendChild(button);
  return button;
}

// Two leaf sections whose layout order is the reverse of the order they are appended in, so a
// reading-order failure cannot pass by accident.
function loadCanvasDocument() {
  registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      lower: {
        id: "lower",
        kind: "leaf",
        name: "Lower",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
      },
      upper: {
        id: "upper",
        kind: "leaf",
        name: "Upper",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: {
      lower: { x: 0, y: 400, w: 200, h: 100, zIndex: 1 },
      upper: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

describe("workspace focus scopes", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.sectionRefs.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
  });

  async function mountScopes(scopeIds: ReadonlyArray<WorkspaceFocusScopeId>) {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<ScopeHost scopeIds={scopeIds} />
        }</WorkspaceTestProvider>,
      );
    });
  }

  it("focuses the first control of a pane and marks the scope on its root", async () => {
    await mountScopes(["leading-pane"]);
    const scopeRoot = requireElement(host, '[data-scope-root="leading-pane"]');
    const outline = appendButton(scopeRoot, "Outline");
    appendButton(scopeRoot, "Inspector");

    expect(focusWorkspaceScope(testWorkspace.host, "leading-pane")).toBe(true);
    expect(document.activeElement).toBe(outline);
    expect(getWorkspaceFocusScopeId(outline)).toBe("leading-pane");
  });

  it("returns to the control focus last reached inside the scope", async () => {
    await mountScopes(["leading-pane", "trailing-pane"]);
    const leadingRoot = requireElement(
      host,
      '[data-scope-root="leading-pane"]',
    );
    appendButton(leadingRoot, "First");
    const second = appendButton(leadingRoot, "Second");
    const trailing = appendButton(
      requireElement(host, '[data-scope-root="trailing-pane"]'),
      "Trailing",
    );

    second.focus();
    trailing.focus();

    expect(focusWorkspaceScope(testWorkspace.host, "leading-pane")).toBe(true);
    expect(document.activeElement).toBe(second);
  });

  it("forgets a remembered control once it leaves the scope", async () => {
    await mountScopes(["leading-pane"]);
    const scopeRoot = requireElement(host, '[data-scope-root="leading-pane"]');
    const first = appendButton(scopeRoot, "First");
    const second = appendButton(scopeRoot, "Second");

    second.focus();
    second.remove();

    expect(focusWorkspaceScope(testWorkspace.host, "leading-pane")).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("leaves a closed pane's panel alone and lands on the tab that reopens it", async () => {
    await mountScopes(["trailing-pane"]);
    const scopeRoot = requireElement(host, '[data-scope-root="trailing-pane"]');
    const tab = appendButton(scopeRoot, "Inspector");
    const panel = document.createElement("div");
    panel.setAttribute("inert", "");
    scopeRoot.appendChild(panel);
    const hiddenControl = appendButton(panel, "Hidden");

    expect(focusWorkspaceScope(testWorkspace.host, "trailing-pane")).toBe(true);
    expect(document.activeElement).toBe(tab);
    expect(document.activeElement).not.toBe(hiddenControl);
  });

  it("declines a scope that is unmounted, empty, or offers only disabled controls", async () => {
    await mountScopes(["leading-pane"]);
    const scopeRoot = requireElement(host, '[data-scope-root="leading-pane"]');

    expect(focusWorkspaceScope(testWorkspace.host, "trailing-pane")).toBe(false);
    expect(focusWorkspaceScope(testWorkspace.host, "leading-pane")).toBe(false);

    appendButton(scopeRoot, "Disabled").disabled = true;
    expect(focusWorkspaceScope(testWorkspace.host, "leading-pane")).toBe(false);
  });

  it("offers the canvas sections in layout reading order rather than DOM order", async () => {
    loadCanvasDocument();
    await mountScopes(["canvas"]);
    const scopeRoot = requireElement(host, '[data-scope-root="canvas"]');
    const lowerRoot = document.createElement("div");
    const upperRoot = document.createElement("div");
    scopeRoot.append(lowerRoot, upperRoot);
    const lowerControl = appendButton(lowerRoot, "Lower control");
    const upperControl = appendButton(upperRoot, "Upper control");
    testWorkspace.sectionRefs.setState({
      withNested: { lower: lowerRoot, upper: upperRoot },
      selfOnly: { lower: lowerRoot, upper: upperRoot },
    });

    expect(focusWorkspaceScope(testWorkspace.host, "canvas")).toBe(true);
    expect(document.activeElement).toBe(upperControl);
    expect(document.activeElement).not.toBe(lowerControl);
  });

  it("stops answering for a scope whose chrome unmounted", async () => {
    await mountScopes(["leading-pane"]);
    appendButton(
      requireElement(host, '[data-scope-root="leading-pane"]'),
      "First",
    );

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<ScopeHost scopeIds={[]} />
        }</WorkspaceTestProvider>,
      );
    });

    expect(focusWorkspaceScope(testWorkspace.host, "leading-pane")).toBe(false);
  });
});
