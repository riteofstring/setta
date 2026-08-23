/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { WorkspaceParameterConfigurationView } from "./WorkspaceParameterConfigurationView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceParameterConfigurationView", () => {
  let container: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    workspace = createWorkspaceTestHost();
    registerSectionKinds(workspace.host, {
      parameters: {
        itemArea: { toolbar: "authoring-and-filter" },
        renderContent: () => null,
      },
    });
    loadWorkspaceDocument(workspace.host, {
      activeIds: ["parameters"],
      sections: {
        parameters: {
          children: [],
          id: "parameters",
          isHorizontalOrientation: false,
          isMinimized: false,
          itemTree: {
            items: {
              amount: codeItem("amount", "amount", "4"),
              nested: {
                children: [],
                id: "nested",
                presentation: {
                  control: { kind: "group" },
                  label: "options",
                  labelEditable: true,
                },
              },
              other: codeItem("other", "other", "2"),
              root: {
                children: ["amount", "nested", "other"],
                id: "root",
              },
            },
            rootId: "root",
            selectedItemIds: [],
          },
          kind: "parameters",
          name: "Parameters",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { height: 200, width: 300 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelSections: {
        parameters: { h: 200, w: 300, x: 0, y: 0, zIndex: 0 },
      },
      viewport: null,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    workspace.host.dispose();
  });

  it("matches main's parameter hierarchy and persists a UI-type change", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceParameterConfigurationView sectionId="parameters" />
        </WorkspaceTestProvider>,
      );
    });

    expect(
      container.querySelector(
        ".setta-workspace-parameter-config-filter .gg-sort-az",
      ),
    ).not.toBeNull();
    expect(
      Array.from(
        container.querySelectorAll(
          ".setta-workspace-parameter-config-title-row h3",
        ),
      ).map((element) => element.textContent),
    ).toEqual(["amount", "options", "other"]);
    expect(container.textContent).toContain("NestedParam");
    expect(
      container.querySelector("[aria-label='code configuration']"),
    ).toBeNull();

    const typeInput = container.querySelector<HTMLInputElement>(
      "input[aria-label='amount UI type']",
    );
    if (typeInput === null) {
      throw new Error("Expected the parameter UI type combobox.");
    }
    expect(typeInput.value).toBe("CodeParam");
    for (const expectedClass of [
      "h-7",
      "rounded-full",
      "font-mono",
      "text-xs",
      "ps-2",
      "pe-8",
      "focus-visible:ring-2",
    ]) {
      expect(typeInput.classList.contains(expectedClass)).toBe(true);
    }
    const toggle = typeInput.closest("search")?.querySelector("button");
    if (!(toggle instanceof HTMLButtonElement)) {
      throw new Error("Expected the parameter UI type toggle.");
    }
    await act(async () => toggle.click());
    const listId = typeInput.getAttribute("aria-controls");
    const list = listId === null ? null : document.getElementById(listId);
    if (list === null) {
      throw new Error("Expected the parameter UI type list.");
    }
    expect(list.querySelector("dt")?.textContent).toBe("Base");
    const options = Array.from(list.querySelectorAll("dd"));
    expect(options.map((option) => option.textContent)).toEqual([
      "CodeParam",
      "TextParam",
      "DateParam",
      "TimeParam",
      "SliderParam",
      "RotaryParam",
      "SwitchParam",
      "ColorPickerParam",
      "DropdownParam",
      "PasswordParam",
      "TextAreaParam",
      "DropzoneParam",
    ]);
    expect(
      options[options.length - 1]?.getAttribute("aria-disabled"),
    ).toBe("true");

    await act(async () => {
      const sliderOption = options.find(
        (option) => option.textContent === "SliderParam",
      );
      if (!(sliderOption instanceof HTMLElement)) {
        throw new Error("Expected SliderParam in the type list.");
      }
      sliderOption.click();
    });
    const storedControl =
      workspace.document.getState().sections.parameters?.itemTree?.items.amount
        ?.presentation?.control;
    expect(storedControl).toMatchObject({
      kind: "slider",
      configuration: { max: 100, min: 0, step: 1 },
    });
    expect(container.textContent).toContain("min");
    expect(container.textContent).toContain("max");
    expect(container.textContent).toContain("step");

    const filter = container.querySelector<HTMLInputElement>(
      "input[aria-label='Filter parameters']",
    );
    if (filter === null) {
      throw new Error("Expected the parameter filter.");
    }
    await act(async () => setInputValue(filter, "options"));
    expect(
      Array.from(
        container.querySelectorAll(
          ".setta-workspace-parameter-config-title-row h3",
        ),
      ).map((element) => element.textContent),
    ).toEqual(["options"]);
  });
});

function codeItem(id: string, label: string, value: string) {
  return {
    children: [],
    id,
    presentation: {
      control: {
        kind: "code" as const,
        value,
        configuration: {
          autocomplete: "off" as const,
          disabled: false,
          language: "python" as const,
          placeholder: null,
          singleLine: true,
          wrapLines: true,
        },
      },
      label,
      labelEditable: true,
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("Expected the native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
