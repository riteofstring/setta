/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type {
  WorkspaceDocument,
  WorkspaceItemControlPresentation,
} from "../document/types";
import { WorkspaceItemConfigurationEditor } from "./WorkspaceItemConfigurationEditor";
import {
  createWorkspaceInspectorItemControl,
  WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS,
} from "./workspaceInspectorItemDefaults";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type ValueControl = Exclude<
  WorkspaceItemControlPresentation,
  { kind: "group" }
>;

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) {
    throw new Error("Expected a native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getLabeledControl<T extends HTMLElement>(
  host: HTMLElement,
  labelText: string,
): T {
  const label = [...host.querySelectorAll("label")].find(
    (candidate) => candidate.textContent?.trim() === labelText,
  );
  if (!label?.htmlFor) {
    throw new Error(`Expected configuration label ${labelText}.`);
  }
  const control = host.querySelector<HTMLElement>(`#${label.htmlFor}`);
  if (!control) {
    throw new Error(`Expected control for configuration label ${labelText}.`);
  }
  return control as T;
}

describe("WorkspaceItemConfigurationEditor", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onChange: Mock<(document: WorkspaceDocument) => void>;
  let onEscape: Mock<() => void>;
  let onStatusChange: Mock<(message: string) => void>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onChange = vi.fn();
    onEscape = vi.fn();
    onStatusChange = vi.fn();
    registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
    testWorkspace.host.subscribe(onChange);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    registerSectionKinds(testWorkspace.host, {});
  });

  function loadControl(control: ValueControl): void {
    loadWorkspaceDocument(testWorkspace.host, {
      sections: {
        leaf: {
          id: "leaf",
          kind: "leaf",
          name: "Leaf",
          size: { width: 240, height: 120 },
          isMinimized: false,
          positionAndSizeLocked: false,
          isHorizontalOrientation: false,
          styleColor: null,
          overflowMode: false,
          tagColor: null,
          children: [],
          itemTree: {
            rootId: "root",
            items: {
              root: { id: "root", children: ["item"] },
              item: {
                id: "item",
                children: [],
                presentation: { label: "Item", labelEditable: true, control },
              },
            },
            selectedItemIds: ["item"],
          },
        },
      },
      topLevelSections: {
        leaf: { x: 0, y: 0, w: 240, h: 120, zIndex: 0 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: ["leaf"],
    });
    onChange.mockClear();
  }

  async function renderEditor(control: ValueControl): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<WorkspaceItemConfigurationEditor
          control={control}
          disabled={false}
          itemId="item"
          onEscape={onEscape}
          onStatusChange={onStatusChange}
          sectionId="leaf"
        />
        }</WorkspaceTestProvider>,
      );
    });
  }

  function getStoredControl(): ValueControl {
    const control =
      testWorkspace.document.getState().sections["leaf"]?.itemTree?.items["item"]
        ?.presentation?.control;
    if (!control || control.kind === "group") {
      throw new Error("Expected a stored value control.");
    }
    return control;
  }

  it.each(WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS)(
    "commits the shared %s disabled field immediately",
    async (kind) => {
      const control = createWorkspaceInspectorItemControl(kind, "previous");
      loadControl(control);
      await renderEditor(control);

      expect(host.querySelector('button[type="submit"]')).toBeNull();
      const disable = host.querySelector<HTMLButtonElement>(
        'button[role="switch"][aria-label="Disable control"]',
      );
      if (!disable) {
        throw new Error(`Expected ${kind} disabled switch.`);
      }
      await act(async () => disable.click());

      expect(getStoredControl().configuration.disabled).toBe(true);
      expect(onChange).toHaveBeenCalledOnce();
      expect(onStatusChange).toHaveBeenCalledWith(
        `${kind} configuration updated.`,
      );
    },
  );

  it("validates and commits numeric fields independently on blur", async () => {
    const control: ValueControl = {
      kind: "slider",
      value: "5",
      configuration: { disabled: false, min: 0, max: 10, step: 1 },
    };
    loadControl(control);
    await renderEditor(control);
    const minimum = getLabeledControl<HTMLInputElement>(host, "min");

    await act(async () => {
      minimum.focus();
      setInputValue(minimum, "10");
      minimum.blur();
    });
    expect(minimum.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("min must be less than max");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      minimum.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(onEscape).toHaveBeenCalledOnce();
    expect(minimum.value).toBe("0");

    await act(async () => {
      minimum.focus();
      setInputValue(minimum, "5");
      minimum.blur();
    });
    expect(getStoredControl().configuration).toMatchObject({
      min: 5,
      max: 10,
      step: 1,
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("cancels dirty text and numeric drafts before Escape restores focus", async () => {
    const focusTarget = document.createElement("button");
    document.body.appendChild(focusTarget);
    onEscape.mockImplementation(() => focusTarget.focus());

    const textControl = createWorkspaceInspectorItemControl("text", "");
    loadControl(textControl);
    await renderEditor(textControl);
    const placeholder = getLabeledControl<HTMLInputElement>(
      host,
      "Placeholder",
    );
    await act(async () => {
      placeholder.focus();
      setInputValue(placeholder, "Canceled placeholder");
      placeholder.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(placeholder.value).toBe("");
    expect(document.activeElement).toBe(focusTarget);
    expect(onChange).not.toHaveBeenCalled();

    const numericControl: ValueControl = {
      kind: "slider",
      value: "5",
      configuration: { disabled: false, min: 0, max: 10, step: 1 },
    };
    loadControl(numericControl);
    await renderEditor(numericControl);
    const minimum = getLabeledControl<HTMLInputElement>(host, "min");
    await act(async () => {
      minimum.focus();
      setInputValue(minimum, "4");
      minimum.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(minimum.value).toBe("0");
    expect(document.activeElement).toBe(focusTarget);
    expect(onChange).not.toHaveBeenCalled();

    focusTarget.remove();
  });

  it("adds a valid dropdown choice without exposing JSON", async () => {
    const control = createWorkspaceInspectorItemControl("dropdown", "");
    loadControl(control);
    await renderEditor(control);
    const addChoice = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add choice"]',
    );
    if (!addChoice) {
      throw new Error("Expected Add choice.");
    }
    await act(async () => addChoice.click());

    expect(getStoredControl().configuration).toMatchObject({
      choices: ["Choice 1"],
    });
    expect(host.querySelector("textarea")).toBeNull();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("creates and extends grouped dropdown choices without JSON", async () => {
    const control = createWorkspaceInspectorItemControl("dropdown", "");
    loadControl(control);
    await renderEditor(control);
    const addGroup = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add choice group"]',
    );
    if (!addGroup) {
      throw new Error("Expected Add choice group.");
    }
    await act(async () => addGroup.click());
    expect(getStoredControl().configuration).toMatchObject({
      choices: [{ group: "Group 1", choices: [] }],
    });

    const groupedControl = getStoredControl();
    if (groupedControl.kind !== "dropdown") {
      throw new Error("Expected stored dropdown control.");
    }
    await renderEditor(groupedControl);
    const addAnotherGroup = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add choice group"]',
    );
    if (!addAnotherGroup) {
      throw new Error("Expected grouped Add choice group.");
    }
    await act(async () => addAnotherGroup.click());
    expect(getStoredControl().configuration).toMatchObject({
      choices: [
        { group: "Group 1", choices: [] },
        { group: "Group 2", choices: [] },
      ],
    });
    expect(host.querySelector("textarea")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("adds described colors and keeps null as the native-picker state", async () => {
    const control = createWorkspaceInspectorItemControl("color", "");
    loadControl(control);
    await renderEditor(control);
    expect(host.textContent).toContain("Native colors");
    const addColor = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add color"]',
    );
    if (!addColor) {
      throw new Error("Expected Add color.");
    }
    await act(async () => addColor.click());

    const stored = getStoredControl();
    expect(stored.kind).toBe("color");
    if (stored.kind !== "color") {
      throw new Error("Expected stored color control.");
    }
    expect(stored.configuration.choices?.[0]?.description).toBe("Color 1");
    expect(stored.configuration.choices?.[0]?.color).toBe("#ff0000");
  });

  it("keeps an attachment maximum below the current count as a local invalid draft", async () => {
    const control: ValueControl = {
      kind: "dropzone",
      value: "",
      configuration: {
        attachments: [
          { id: "one", kind: "file", name: "one.txt", size: 10 },
          { id: "two", kind: "text", name: "two.txt", size: null },
        ],
        disabled: false,
        errorMessage: null,
        pending: false,
        placeholder: "Drop files here",
        policy: {
          allowedMimePrefixes: [],
          maxAttachments: null,
          maxFileBytes: 1_024,
          maxTotalBytes: null,
        },
      },
    };
    loadControl(control);
    await renderEditor(control);
    const maximum = getLabeledControl<HTMLInputElement>(
      host,
      "Max attachments",
    );
    await act(async () => {
      maximum.focus();
      setInputValue(maximum, "1");
      maximum.blur();
    });

    expect(maximum.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain(
      "Maximum attachments cannot be lower than the current attachment count (2).",
    );
    expect(getStoredControl().configuration).toMatchObject({
      policy: { maxAttachments: null },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("forces single-date selection when time is included", async () => {
    const control: ValueControl = {
      kind: "date",
      value: "",
      configuration: {
        controlMode: "calendar",
        disabled: false,
        displayFormat: "iso",
        includeTime: false,
        selectionMode: "multiple",
        timeDisplayFormat: "twenty_four_hour",
        weekStart: "sunday",
      },
    };
    loadControl(control);
    await renderEditor(control);
    expect(getLabeledControl<HTMLSelectElement>(host, "Selection").value).toBe(
      "multiple",
    );
    const includeTime = host.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Include Time"]',
    );
    if (!includeTime) {
      throw new Error("Expected Include Time switch.");
    }
    await act(async () => includeTime.click());

    expect(getStoredControl().configuration).toMatchObject({
      includeTime: true,
      selectionMode: "single",
    });
  });

  it("reveals display-only time configuration after the mode commit", async () => {
    const control = createWorkspaceInspectorItemControl("time", "");
    loadControl(control);
    await renderEditor(control);
    expect(host.querySelector('[aria-label="Transparent"]')).toBeNull();

    const mode = getLabeledControl<HTMLSelectElement>(host, "Time UI");
    await act(async () => {
      mode.value = "display";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const stored = getStoredControl();
    await renderEditor(stored);

    expect(host.querySelector('[aria-label="Transparent"]')).not.toBeNull();
    expect(getLabeledControl<HTMLInputElement>(host, "Clock Scale").type).toBe(
      "range",
    );
    expect(getLabeledControl<HTMLSelectElement>(host, "Clock Font").value).toBe(
      "system",
    );
  });
});
