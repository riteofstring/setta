import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import {
  getExtensions,
  getGpuFlowCodeMirrorDirtyReason,
} from "./getExtensions";

vi.mock("state/actions/undo", () => ({
  redoProjectState: vi.fn(),
  undoProjectState: vi.fn(),
}));
vi.mock("state/definitions", () => ({
  useSettings: {
    getState: () => ({
      shortcuts: {
        redoShortcut: "Mod + Shift + Z",
        runCodeShortcut: "Mod + Enter",
        runEntryCodeBlockShortcut: "Mod + Shift + Enter",
        undoShortcut: "Mod + Z",
      },
    }),
  },
}));
vi.mock("utils/focusManager", () => ({
  moveFocus: vi.fn(() => true),
}));

describe("getExtensions", () => {
  it("includes distinct language support extensions for json, yaml, and toml", () => {
    const jsonExtensions = getExtensions({
      language: "json",
      wrapLines: false,
    });
    const yamlExtensions = getExtensions({
      language: "yaml",
      wrapLines: false,
    });
    const tomlExtensions = getExtensions({
      language: "toml",
      wrapLines: false,
    });
    const noLanguageExtensions = getExtensions({
      language: null,
      wrapLines: false,
    });

    expect(jsonExtensions).toHaveLength(noLanguageExtensions.length + 1);
    expect(yamlExtensions).toHaveLength(noLanguageExtensions.length + 1);
    expect(tomlExtensions).toHaveLength(noLanguageExtensions.length + 1);
    expect(jsonExtensions[2]).not.toBe(yamlExtensions[2]);
    expect(tomlExtensions[2]).not.toBe(yamlExtensions[2]);
  });

  it("omits language support when no language is provided", () => {
    expect(getExtensions({ language: null, wrapLines: false })).toHaveLength(3);
  });

  it("normalizes inserted newlines for single-line editors", () => {
    const state = EditorState.create({
      doc: "alpha",
      extensions: getExtensions({
        language: null,
        singleLine: true,
        wrapLines: false,
      }),
    });

    const transaction = state.update({
      changes: { from: state.doc.length, insert: "\nbeta\r\ngamma" },
    });

    expect(transaction.newDoc.toString()).toBe("alpha beta gamma");
    expect(transaction.newDoc.lines).toBe(1);
  });

  it("classifies CodeMirror updates for GPU flow dirty texture events", () => {
    expect(
      getGpuFlowCodeMirrorDirtyReason(createUpdate({ docChanged: true })),
    ).toBe("input");
    expect(
      getGpuFlowCodeMirrorDirtyReason(createUpdate({ selectionSet: true })),
    ).toBe("selection");
    expect(
      getGpuFlowCodeMirrorDirtyReason(createUpdate({ viewportChanged: true })),
    ).toBe("scroll");
    expect(
      getGpuFlowCodeMirrorDirtyReason(createUpdate({ focusChanged: true })),
    ).toBe("focus");
    expect(getGpuFlowCodeMirrorDirtyReason(createUpdate({}))).toBeNull();
  });
});

function createUpdate(
  update: Partial<Parameters<typeof getGpuFlowCodeMirrorDirtyReason>[0]>,
): Parameters<typeof getGpuFlowCodeMirrorDirtyReason>[0] {
  return {
    docChanged: false,
    focusChanged: false,
    geometryChanged: false,
    selectionSet: false,
    viewportChanged: false,
    ...update,
  };
}
