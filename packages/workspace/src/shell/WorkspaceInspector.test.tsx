/* @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceItemControlPresentation,
  WorkspaceSectionInput,
} from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import { WorkspaceInspector } from "./WorkspaceInspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 240, height: 120 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function makeItemSection(
  control: WorkspaceItemControlPresentation,
  selectedItemIds: Array<string> = ["value"],
): WorkspaceSectionInput {
  return makeSection("items", {
    name: "Items",
    itemTree: {
      rootId: "root",
      items: {
        root: { id: "root", children: ["value", "other"] },
        value: {
          id: "value",
          children: [],
          presentation: { label: "Amount", control },
        },
        other: {
          id: "other",
          children: [],
          presentation: {
            label: "Other",
            control: {
              kind: "text",
              value: "other",
              configuration: {
                autocomplete: "off",
                disabled: false,
                placeholder: null,
                singleLine: true,
                wrapLines: true,
              },
            },
          },
        },
      },
      selectedItemIds,
    },
  });
}

function createDocument(
  activeIds: Array<string>,
  overrides: Record<string, WorkspaceSectionInput> = {},
): WorkspaceDocumentInput {
  const sections = {
    alpha: makeSection("alpha", { name: "Alpha" }),
    bravo: makeSection("bravo", {
      name: "Bravo",
      positionAndSizeLocked: true,
    }),
    ...overrides,
  };
  return {
    sections,
    topLevelSections: Object.fromEntries(
      Object.keys(sections).map((sectionId, index) => [
        sectionId,
        { x: index * 200, y: index * 50, w: 240, h: 120, zIndex: index },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
  };
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("Expected a native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getLabeledControl<T extends HTMLElement>(host: HTMLElement, labelText: string): T {
  const label = [...host.querySelectorAll("label")].find(
    (candidate) => candidate.textContent?.trim() === labelText,
  );
  if (!label) {
    throw new Error(`Expected Inspector label ${labelText}.`);
  }
  const control = label.htmlFor
    ? host.querySelector<HTMLElement>(`#${label.htmlFor}`)
    : label.querySelector<HTMLElement>("input, select, textarea");
  if (!control) {
    throw new Error(`Expected control for Inspector label ${labelText}.`);
  }
  return control as T;
}

function getButton(host: HTMLElement, text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Expected Inspector button ${text}.`);
  }
  return button;
}

describe("WorkspaceInspector", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    registerSectionKinds({
      leaf: { renderContent: () => null },
      custom: {
        renderContent: () => null,
        renderInspector: (context) => <button type="button">Host {context.type} inspector</button>,
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    useWorkspaceCapabilities.getState().reset();
    useItemSelectionMode.getState().reset();
    useSectionRefs.getState().reset();
    registerSectionKinds({});
    vi.restoreAllMocks();
  });

  async function renderInspector(document: WorkspaceDocumentInput) {
    loadWorkspaceDocument(document);
    const initialFocusRef = createRef<HTMLElement>();
    await act(async () => {
      root.render(<WorkspaceInspector initialFocusRef={initialFocusRef} />);
    });
    return initialFocusRef;
  }

  it("renders and focuses the reference empty state", async () => {
    const initialFocusRef = await renderInspector(createDocument([]));

    expect(host.textContent).toContain("Select A Section to Edit");
    expect(initialFocusRef.current?.getAttribute("aria-label")).toBe(
      "Workspace Inspector selection",
    );
  });

  it("keeps invalid section accents inside the pane and restores focus on Escape", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(createDocument(["alpha"]));
    const accent = getLabeledControl<HTMLInputElement>(host, "Style accent");

    await act(async () => {
      accent.focus();
      setInputValue(accent, "blue");
      accent.blur();
    });

    expect(accent.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("Enter a six-digit hex color");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      accent.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Workspace Inspector selection"]'),
    );
    expect(accent.value).toBe("");
  });

  it("edits a typed numeric configuration once and rejects an invalid range", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    useItemSelectionMode.setState({ isSelectingItems: true });
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection({
          kind: "slider",
          value: "5",
          configuration: { disabled: false, min: 0, max: 10, step: 1 },
        }),
      }),
    );
    const minimum = getLabeledControl<HTMLInputElement>(host, "Minimum");
    const maximum = getLabeledControl<HTMLInputElement>(host, "Maximum");
    const step = getLabeledControl<HTMLInputElement>(host, "Step");
    expect(step.step).toBe("any");
    const liveValue = host.querySelector<HTMLInputElement>(
      '[aria-label="Amount value numeric value"]',
    );
    expect(liveValue?.disabled).toBe(false);

    await act(async () => {
      setInputValue(minimum, "10");
      setInputValue(maximum, "5");
      getButton(host, "Apply configuration").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(minimum.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("min must be less than max");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      minimum.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.activeElement).toBe(
      host.querySelector('[aria-label="Workspace Inspector selection"]'),
    );
    expect(minimum.getAttribute("aria-invalid")).toBeNull();

    await act(async () => {
      setInputValue(minimum, "10");
      setInputValue(maximum, "20");
      setInputValue(step, "0.5");
      getButton(host, "Apply configuration").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const control =
      useWorkspaceDocument.getState().sections["items"]?.itemTree?.items["value"]?.presentation
        ?.control;
    expect(control).toMatchObject({
      kind: "slider",
      configuration: { min: 10, max: 20, step: 0.5 },
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(host.querySelector(".setta-workspace-inspector-status")?.textContent).toContain(
      "slider configuration updated",
    );
  });

  it("keeps locked section sizing read-only until the section is unlocked", async () => {
    await renderInspector(createDocument(["bravo"]));

    expect(getLabeledControl<HTMLInputElement>(host, "Width").disabled).toBe(true);
    expect(getLabeledControl<HTMLInputElement>(host, "Height").disabled).toBe(true);
    expect(getButton(host, "Apply size").disabled).toBe(true);
  });

  it("changes a typed item's UI type through one complete presentation mutation", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection({
          kind: "slider",
          value: "5",
          configuration: { disabled: false, min: 0, max: 10, step: 1 },
        }),
      }),
    );
    const uiType = getLabeledControl<HTMLSelectElement>(host, "UI type");

    await act(async () => {
      uiType.value = "rotary";
      uiType.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(
      useWorkspaceDocument.getState().sections["items"]?.itemTree?.items["value"]?.presentation
        ?.control,
    ).toEqual({
      kind: "rotary",
      value: "0",
      configuration: { disabled: false, min: 0, max: 1, step: 0.1 },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("shows an explicit multiple-item branch without guessed common editors", async () => {
    await renderInspector(
      createDocument(["items"], {
        items: makeItemSection(
          {
            kind: "slider",
            value: "5",
            configuration: { disabled: false, min: 0, max: 10, step: 1 },
          },
          ["value", "other"],
        ),
      }),
    );

    expect(host.textContent).toContain("2 items selected");
    expect(host.querySelector('[aria-label="UI type"]')).toBeNull();
  });

  it("disables every multi-section action outside its owning capability", async () => {
    useWorkspaceCapabilities.setState({ canEditLayout: false, canEditStructure: false });
    await renderInspector(createDocument(["alpha", "bravo"]));

    expect(getButton(host, "Lock all").disabled).toBe(true);
    expect(getButton(host, "Group").disabled).toBe(true);
    expect(getButton(host, "Delete").disabled).toBe(true);
  });

  it("shows explicit mixed state and applies each common multi-section action once", async () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000",
    );
    await renderInspector(createDocument(["alpha", "bravo"]));

    expect(host.textContent).toContain("Mixed");
    await act(async () => {
      getButton(host, "Lock all").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useWorkspaceDocument.getState().sections["alpha"]?.positionAndSizeLocked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();

    onChange.mockClear();
    await act(async () => {
      getButton(host, "Group").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const group =
      useWorkspaceDocument.getState().sections["group-00000000-0000-4000-8000-000000000000"];
    expect(group?.children).toEqual(["alpha", "bravo"]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("renders a typed host contribution for custom section and item content", async () => {
    await renderInspector(
      createDocument(["custom"], {
        custom: makeSection("custom", { kind: "custom", name: "Custom" }),
      }),
    );
    expect(host.textContent).toContain("Host section inspector");

    await act(async () => {
      loadWorkspaceDocument(
        createDocument(["custom-items"], {
          "custom-items": makeSection("custom-items", {
            kind: "custom",
            itemTree: {
              rootId: "root",
              items: {
                root: { id: "root", children: ["opaque"] },
                opaque: { id: "opaque", children: [], data: { value: "host" } },
              },
              selectedItemIds: ["opaque"],
            },
          }),
        }),
      );
    });

    expect(host.textContent).toContain("Host item inspector");
  });
});
