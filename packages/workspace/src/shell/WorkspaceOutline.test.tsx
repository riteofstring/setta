/* @vitest-environment jsdom */

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { useWorkspaceMenuState } from "../context-menu/workspaceMenuState";
import { getActiveSectionIds } from "../document/activeSections";
import { GROUP_SECTION_KIND } from "../document/documentSelectors";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import {
  registerSectionKinds,
  type WorkspaceSectionKindIconProps,
} from "../document/sectionKindRegistry";
import { deleteSection, setSectionName } from "../document/sectionMutations";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Node, WorkspaceSection } from "../document/types";
import { WorkspaceOutline } from "./WorkspaceOutline";
import type { WorkspaceShellOutlineViewState } from "./workspaceShellTypes";

const { focusWorkspaceSection } = vi.hoisted(() => ({
  focusWorkspaceSection: vi.fn(),
}));

vi.mock("../canvas/viewportHelpers", () => ({ focusWorkspaceSection }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function LeafIcon({ sectionId }: WorkspaceSectionKindIconProps) {
  return <svg data-icon-section-id={sectionId} data-testid="leaf-icon" viewBox="0 0 12 12" />;
}

function createSection(
  id: string,
  name: string,
  children: Array<string> = [],
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    id,
    kind: children.length > 0 ? GROUP_SECTION_KIND : "leaf",
    name,
    size: { width: 200, height: 100 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children,
    ...overrides,
  };
}

function createNode(id: string, zIndex: number): Node {
  return {
    id,
    position: { x: zIndex * 300, y: 0 },
    width: 200,
    height: 100,
    zIndex,
    tempZIndex: zIndex,
    kind: id === "alpha" ? GROUP_SECTION_KIND : "leaf",
  };
}

function loadOutlineDocument(): void {
  useWorkspaceDocument.setState({
    sections: {
      alpha: createSection("alpha", "Alpha group", ["bravo", "charlie"]),
      bravo: createSection("bravo", "Bravo", [], {
        isMinimized: true,
        positionAndSizeLocked: true,
        styleColor: "#3b82f6",
        tagColor: "#ef4444",
      }),
      charlie: createSection("charlie", "Charlie"),
      echo: createSection("echo", "Echo"),
    },
    topLevelSections: {
      alpha: { x: 0, y: 0, w: 200, h: 100, zIndex: 0 },
      echo: { x: 300, y: 0, w: 200, h: 100, zIndex: 1 },
    },
    viewport: null,
    parentSectionMap: { bravo: "alpha", charlie: "alpha" },
  });
  useNodeInternals.setState({
    x: new Map([
      ["alpha", createNode("alpha", 0)],
      ["echo", createNode("echo", 1)],
    ]),
  });
}

function Harness({ onChange }: { onChange: (state: WorkspaceShellOutlineViewState) => void }) {
  const initialFocusRef = useRef<HTMLElement>(null);
  const [viewState, setViewState] = useState<WorkspaceShellOutlineViewState>({
    collapsedGroupIds: [],
    focusedSectionId: null,
  });
  return (
    <WorkspaceOutline
      initialFocusRef={initialFocusRef}
      onViewStateChange={(nextState) => {
        onChange(nextState);
        setViewState(nextState);
      }}
      viewState={viewState}
    />
  );
}

describe("WorkspaceOutline", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn<(state: WorkspaceShellOutlineViewState) => void>();

  beforeEach(async () => {
    registerSectionKinds({
      leaf: {
        icon: LeafIcon,
        renderContent: () => null,
      },
    });
    useActiveSections.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useItemSelectionMode.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    useWorkspaceMenuState.getState().reset();
    loadOutlineDocument();
    focusWorkspaceSection.mockReset();
    onChange.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<Harness onChange={onChange} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useActiveSections.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useWorkspaceMenuState.getState().reset();
  });

  function getRow(sectionId: string): HTMLDivElement {
    const row = host.querySelector<HTMLDivElement>(
      `[role="treeitem"][data-workspace-outline-item="${sectionId}"]`,
    );
    if (!row) {
      throw new Error(`Expected Outline row ${sectionId}.`);
    }
    return row;
  }

  function getFilterInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(".setta-workspace-outline-filter-input");
    if (!input) {
      throw new Error("Expected the Outline filter input.");
    }
    return input;
  }

  async function filterOutline(value: string): Promise<void> {
    await act(async () => {
      const input = getFilterInput();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!valueSetter) {
        throw new Error("Expected the native input value setter.");
      }
      valueSetter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function key(sectionId: string, keyValue: string, init?: KeyboardEventInit) {
    await act(async () => {
      getRow(sectionId).dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: keyValue, ...init }),
      );
    });
  }

  it("renders a recursive multi-select tree with one tab stop and no nested interactive rows", () => {
    const tree = host.querySelector('[role="tree"][aria-label="Workspace outline"]');
    expect(tree?.getAttribute("aria-multiselectable")).toBe("true");
    expect(
      Array.from(host.querySelectorAll('[role="treeitem"]')).map((row) =>
        row.getAttribute("data-workspace-outline-item"),
      ),
    ).toEqual(["alpha", "bravo", "charlie", "echo"]);
    expect(getRow("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(getRow("alpha").getAttribute("aria-level")).toBe("1");
    expect(getRow("bravo").getAttribute("aria-level")).toBe("2");
    expect(getRow("bravo").getAttribute("aria-posinset")).toBe("1");
    expect(getRow("bravo").getAttribute("aria-setsize")).toBe("2");
    expect(host.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
    expect(getRow("alpha").tabIndex).toBe(0);
    for (const row of host.querySelectorAll('[role="treeitem"]')) {
      expect(row.querySelector("button, a, input, select, textarea, [tabindex]")).toBeNull();
    }
    expect(getRow("bravo").textContent).toContain(
      "locked, minimized, style accent #3b82f6, color tag #ef4444",
    );
    expect(
      getRow("bravo")
        .querySelector('[data-testid="leaf-icon"]')
        ?.getAttribute("data-icon-section-id"),
    ).toBe("bravo");
  });

  it("filters fuzzy section names, reveals matching paths, and restores collapsed state", async () => {
    const filter = getFilterInput();
    const tree = host.querySelector<HTMLElement>('[role="tree"][aria-label="Workspace outline"]');
    expect(filter.getAttribute("aria-controls")).toBe(tree?.id);
    expect(filter.placeholder).toBe("Filter");
    expect(filter.compareDocumentPosition(getRow("alpha")) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const disclosure = getRow("alpha").querySelector<HTMLElement>(
      "[data-workspace-outline-disclosure]",
    );
    await act(async () => {
      disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(host.querySelector('[data-workspace-outline-item="bravo"]')).toBeNull();

    await filterOutline("brv");
    expect(getRow("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(getRow("bravo").textContent).toContain("Bravo");
    expect(host.querySelector('[data-workspace-outline-item="charlie"]')).toBeNull();
    expect(host.querySelector('[data-workspace-outline-item="echo"]')).toBeNull();
    expect(getRow("alpha").querySelector("[data-workspace-outline-disclosure]")).toBeNull();

    await filterOutline("no such section");
    expect(tree?.textContent).toContain("No matching sections");

    await filterOutline("");
    expect(host.querySelector('[data-workspace-outline-item="bravo"]')).toBeNull();
    expect(getRow("alpha").getAttribute("aria-expanded")).toBe("false");
  });

  it("focuses and routes plain or modified pointer selection through the shared policy", async () => {
    await act(async () => {
      getRow("bravo").dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(getActiveSectionIds()).toEqual(["bravo"]);
    expect(getRow("bravo").getAttribute("aria-selected")).toBe("true");
    expect(focusWorkspaceSection).toHaveBeenLastCalledWith("bravo");

    await act(async () => {
      getRow("echo").dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }),
      );
    });
    expect(getActiveSectionIds()).toEqual(["bravo", "echo"]);
    expect(getRow("bravo").getAttribute("aria-selected")).toBe("true");
    expect(getRow("echo").getAttribute("aria-selected")).toBe("true");
  });

  it("opens Outline-scoped menus from pointer and Shift+F10", async () => {
    const pointerEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 90,
    });
    await act(async () => {
      getRow("bravo").dispatchEvent(pointerEvent);
    });
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(getActiveSectionIds()).toEqual(["bravo"]);
    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "section",
      clientPoint: { x: 140, y: 90 },
      surface: "outline",
      context: { scope: "section", section: { id: "bravo" } },
    });

    useWorkspaceMenuState.getState().reset();
    getRow("alpha").getBoundingClientRect = () =>
      ({ left: 20, right: 220, top: 40, width: 200, height: 20 }) as DOMRect;
    await key("alpha", "F10", { shiftKey: true });
    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "section",
      clientPoint: { x: 32, y: 50 },
      surface: "outline",
      context: { scope: "section", section: { id: "alpha" } },
    });
  });

  it("separates disclosure from selection and restores focus to the collapsing group", async () => {
    const disclosure = getRow("alpha").querySelector<HTMLElement>(
      "[data-workspace-outline-disclosure]",
    );
    await act(async () => {
      disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });

    expect(getActiveSectionIds()).toEqual([]);
    expect(getRow("alpha").getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector('[data-workspace-outline-item="bravo"]')).toBeNull();
    expect(document.activeElement).toBe(getRow("alpha"));
  });

  it("supports Arrow, Home, End, disclosure, activation, and typeahead tree keys", async () => {
    getRow("alpha").focus();
    await key("alpha", "ArrowRight");
    expect(document.activeElement).toBe(getRow("bravo"));

    await key("bravo", "ArrowDown");
    expect(document.activeElement).toBe(getRow("charlie"));
    await key("charlie", "End");
    expect(document.activeElement).toBe(getRow("echo"));
    await key("echo", "Home");
    expect(document.activeElement).toBe(getRow("alpha"));

    await key("alpha", "ArrowLeft");
    expect(getRow("alpha").getAttribute("aria-expanded")).toBe("false");
    await key("alpha", "ArrowRight");
    expect(getRow("alpha").getAttribute("aria-expanded")).toBe("true");
    await key("alpha", "c");
    expect(document.activeElement).toBe(getRow("charlie"));

    await key("charlie", " ");
    expect(getActiveSectionIds()).toEqual(["charlie"]);
    expect(focusWorkspaceSection).toHaveBeenLastCalledWith("charlie");
  });

  it("keeps renamed focus and restores deleted focus to the next row at the same position", async () => {
    await act(async () => {
      getRow("bravo").focus();
    });
    expect(document.activeElement).toBe(getRow("bravo"));

    await act(async () => {
      setSectionName("bravo", "Bravo renamed");
    });
    expect(getRow("bravo").textContent).toContain("Bravo renamed");
    expect(document.activeElement).toBe(getRow("bravo"));

    await act(async () => {
      deleteSection("bravo");
    });
    expect(host.querySelector('[data-workspace-outline-item="bravo"]')).toBeNull();
    expect(document.activeElement).toBe(getRow("charlie"));
    expect(getRow("charlie").tabIndex).toBe(0);
  });
});
