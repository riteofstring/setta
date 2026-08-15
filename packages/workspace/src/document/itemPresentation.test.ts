import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceDocumentChangeCallback } from "./documentChangeCallback";
import {
  setItemControlConfiguration,
  setItemLabel,
  setItemPresentation,
  setItemValue,
} from "./itemPresentationMutations";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "./stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceItem,
  WorkspaceItemControlPresentation,
} from "./types";

const VALID_CONTROLS: ReadonlyArray<WorkspaceItemControlPresentation> = [
  { kind: "group" },
  {
    kind: "text",
    value: "plain",
    configuration: {
      autocomplete: "off",
      disabled: false,
      placeholder: null,
      singleLine: true,
      wrapLines: false,
    },
  },
  {
    kind: "code",
    value: "print('ok')",
    configuration: {
      autocomplete: "off",
      disabled: false,
      language: "python",
      placeholder: null,
      singleLine: false,
      wrapLines: true,
    },
  },
  {
    kind: "textarea",
    value: "first\nsecond",
    configuration: {
      autocomplete: "off",
      disabled: false,
      language: null,
      placeholder: "Write",
    },
  },
  { kind: "switch", value: "true", configuration: { disabled: false } },
  {
    kind: "dropdown",
    value: "Alpha",
    configuration: {
      choices: ["Alpha", "Beta"],
      disabled: false,
      placeholder: null,
    },
  },
  {
    kind: "color",
    value: "#22c55e",
    configuration: {
      choices: [{ color: "#22c55e", description: "Green" }],
      disabled: false,
    },
  },
  {
    kind: "slider",
    value: "5",
    configuration: { disabled: false, min: 0, max: 10, step: 1 },
  },
  {
    kind: "rotary",
    value: "0.5",
    configuration: { disabled: false, min: 0, max: 1, step: 0.1 },
  },
  {
    kind: "password",
    value: "",
    configuration: { disabled: false, placeholder: null, savedValuePending: false },
  },
  {
    kind: "date",
    value: "2026-08-12",
    configuration: {
      controlMode: "input",
      disabled: false,
      displayFormat: "iso",
      includeTime: false,
      selectionMode: "single",
      timeDisplayFormat: "twenty_four_hour",
      weekStart: "sunday",
    },
  },
  {
    kind: "time",
    value: "13:45",
    configuration: {
      controlMode: "input",
      disabled: false,
      displayFormat: "twenty_four_hour",
      font: "monospace",
      scale: 1,
      transparent: false,
    },
  },
  {
    kind: "dropzone",
    value: "",
    configuration: {
      attachments: [],
      disabled: false,
      errorMessage: null,
      pending: false,
      placeholder: "Drop a file here",
      policy: {
        allowedMimePrefixes: [],
        maxAttachments: null,
        maxFileBytes: 1024,
        maxTotalBytes: null,
      },
    },
  },
];

function makeDocument(items: Record<string, WorkspaceItem>): WorkspaceDocumentInput {
  return {
    sections: {
      panel: {
        id: "panel",
        kind: "leaf",
        name: "Panel",
        size: { width: 320, height: 240 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "root",
          items,
          selectedItemIds: [],
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 320, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  };
}

function makeSingleItemDocument(control: WorkspaceItemControlPresentation): WorkspaceDocumentInput {
  return makeDocument({
    root: { id: "root", children: ["item"] },
    item: { id: "item", children: [], presentation: { label: "Item", control } },
  });
}

function getStoredItemPresentation() {
  const section = useWorkspaceDocument.getState().sections.panel;
  if (!section) {
    throw new Error("The typed-item fixture lost its panel section.");
  }
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error("The typed-item fixture lost its item tree.");
  }
  const item = itemTree.items.item;
  if (!item?.presentation) {
    throw new Error("The typed-item fixture lost its built-in item.");
  }
  return item.presentation;
}

describe("typed workspace item presentations", () => {
  beforeEach(() => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  it("loads and round-trips every built-in ordinary presentation", () => {
    const itemIds = VALID_CONTROLS.map((control, index) => `${control.kind}-${index}`);
    const items = Object.fromEntries(
      VALID_CONTROLS.map((control, index) => {
        const itemId = itemIds[index];
        if (!itemId) {
          throw new Error("The valid-control fixture lost an item id.");
        }
        return [itemId, { id: itemId, children: [], presentation: { label: itemId, control } }];
      }),
    );
    loadWorkspaceDocument(makeDocument({ root: { id: "root", children: itemIds }, ...items }));
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.items).toEqual({
      root: { id: "root", children: itemIds },
      ...items,
    });
  });

  it("rejects ambiguous, root, unknown, and malformed presentations at load", () => {
    const textControl = VALID_CONTROLS[1];
    if (!textControl || textControl.kind !== "text") {
      throw new Error("The typed-item fixture lost its text control.");
    }
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          root: { id: "root", children: ["item"] },
          item: {
            id: "item",
            children: [],
            data: { custom: true },
            presentation: { label: "Item", control: textControl },
          },
        }),
      ),
    ).toThrowError(
      "Section panel item item cannot contain both a built-in presentation and opaque data.",
    );
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          root: {
            id: "root",
            children: [],
            presentation: { label: "Root", control: { kind: "group" } },
          },
        }),
      ),
    ).toThrowError(
      "Section panel item root is the structural root and cannot contain row content.",
    );
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({ root: { id: "root", children: [], data: { custom: true } } }),
      ),
    ).toThrowError(
      "Section panel item root is the structural root and cannot contain row content.",
    );
    expect(() =>
      loadWorkspaceDocument(makeSingleItemDocument({ kind: "mystery" } as never)),
    ).toThrowError("Section panel item item presentation.control names the unknown kind mystery.");
    expect(() =>
      loadWorkspaceDocument(
        makeSingleItemDocument({
          kind: "slider",
          value: "0",
          configuration: { disabled: false, min: 10, max: 0, step: 1 },
        }),
      ),
    ).toThrowError(
      "Section panel item item presentation.control.configuration.min must be less than max.",
    );
    expect(() =>
      loadWorkspaceDocument(
        makeSingleItemDocument({
          kind: "switch",
          value: "true",
          configuration: { disabled: false, futureOption: true },
        } as never),
      ),
    ).toThrowError(
      "Section panel item item presentation.control.configuration contains the unknown field futureOption.",
    );
  });

  it("rejects invalid type-specific choice, time, and dropzone options", () => {
    expect(() =>
      loadWorkspaceDocument(
        makeSingleItemDocument({
          kind: "dropdown",
          value: "Alpha",
          configuration: {
            disabled: false,
            placeholder: null,
            choices: ["Alpha", { group: "More", choices: ["Beta"] }] as never,
          },
        }),
      ),
    ).toThrowError(
      "Section panel item item presentation.control.configuration.choices cannot mix flat choices and choice groups.",
    );
    expect(() =>
      loadWorkspaceDocument(
        makeSingleItemDocument({
          kind: "time",
          value: "13:45",
          configuration: {
            controlMode: "input",
            disabled: false,
            displayFormat: "twenty_four_hour",
            font: "monospace",
            scale: 4,
            transparent: false,
          },
        }),
      ),
    ).toThrowError(
      "Section panel item item presentation.control.configuration.scale must be between 0.5 and 3.",
    );
    expect(() =>
      loadWorkspaceDocument(
        makeSingleItemDocument({
          kind: "dropzone",
          value: "",
          configuration: {
            attachments: [],
            disabled: false,
            errorMessage: null,
            pending: false,
            placeholder: "Drop",
            policy: {
              allowedMimePrefixes: [],
              maxAttachments: null,
              maxFileBytes: 0,
              maxTotalBytes: null,
            },
          },
        }),
      ),
    ).toThrowError(
      "Section panel item item presentation.control.configuration.policy.maxFileBytes must be a positive safe integer.",
    );
    expect(() =>
      loadWorkspaceDocument(
        makeSingleItemDocument({
          kind: "dropzone",
          value: "",
          configuration: {
            attachments: [
              { id: "one", kind: "file", name: "one.txt", size: 1 },
              { id: "two", kind: "file", name: "two.txt", size: 1 },
            ],
            disabled: false,
            errorMessage: null,
            pending: false,
            placeholder: "Drop",
            policy: {
              allowedMimePrefixes: [],
              maxAttachments: 1,
              maxFileBytes: 1024,
              maxTotalBytes: null,
            },
          },
        }),
      ),
    ).toThrowError(
      "Section panel item item presentation.control.configuration.attachments exceeds policy.maxAttachments.",
    );
  });

  it("commits label, value, kind, and configuration through one notification each", () => {
    const codeControl = VALID_CONTROLS[2];
    if (!codeControl || codeControl.kind !== "code") {
      throw new Error("The typed-item fixture lost its code control.");
    }
    loadWorkspaceDocument(makeSingleItemDocument(codeControl));
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);

    setItemLabel("panel", "item", "Renamed");
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(getStoredItemPresentation()).toMatchObject({
      label: "Renamed",
      control: { kind: "code" },
    });

    setItemValue("panel", "item", "next()");
    expect(onDocumentChange).toHaveBeenCalledTimes(2);
    expect(getStoredItemPresentation().control).toMatchObject({ kind: "code", value: "next()" });

    setItemControlConfiguration("panel", "item", {
      kind: "code",
      configuration: {
        ...codeControl.configuration,
        language: "typescript",
      },
    });
    expect(onDocumentChange).toHaveBeenCalledTimes(3);
    expect(getStoredItemPresentation().control).toMatchObject({
      kind: "code",
      configuration: { language: "typescript" },
    });

    setItemPresentation("panel", "item", {
      kind: "switch",
      value: "false",
      configuration: { disabled: false },
    });
    expect(onDocumentChange).toHaveBeenCalledTimes(4);
    expect(getStoredItemPresentation()).toEqual({
      label: "Renamed",
      control: { kind: "switch", value: "false", configuration: { disabled: false } },
    });
  });

  it("fails stale or inapplicable mutations without publishing", () => {
    loadWorkspaceDocument(makeSingleItemDocument({ kind: "group" }));
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    expect(() => setItemValue("panel", "item", "nope")).toThrowError(
      "Section panel item item is a group and has no controlled value.",
    );
    expect(() =>
      setItemControlConfiguration("panel", "item", {
        kind: "switch",
        configuration: { disabled: false },
      }),
    ).toThrowError("Section panel item item is a group and has no control config.");
    expect(onDocumentChange).not.toHaveBeenCalled();

    setItemPresentation("panel", "item", {
      kind: "switch",
      value: "true",
      configuration: { disabled: false },
    });
    onDocumentChange.mockClear();
    expect(() =>
      setItemControlConfiguration("panel", "item", {
        kind: "slider",
        configuration: { disabled: false, min: 0, max: 10, step: 1 },
      }),
    ).toThrowError("Section panel item item is switch, not slider.");
    expect(() => setItemControlConfiguration("panel", "item", null as never)).toThrowError(
      "Section panel item item control-configuration mutation must be an object.",
    );
    expect(onDocumentChange).not.toHaveBeenCalled();
  });
});
