import { getTempParamDndId } from "forks/dnd-kit/paramDndState";
import { describe, expect, it } from "vitest";
import { buildVisibleParamScenePackets } from "./paramSwitchScenePackets";

describe("buildVisibleParamScenePackets", () => {
  it("builds semantic row packets for the live filtered param path", () => {
    // Extend the benchmark-shell packet work into the live param rows:
    // visible ancestors stay in order and carry stable group/value semantics.
    expect(
      buildVisibleParamScenePackets({
        getParamEditorKind: (paramId: string) =>
          paramId === "beta-leaf" ? "combobox" : "other",
        getParamValuePresentationKind: (paramId: string) =>
          paramId === "beta-leaf" ? "combobox" : "text",
        paramIds: ["alpha-group", "alpha-leaf", "beta-group", "beta-leaf"],
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
          "beta-leaf": ["beta-group", "beta-leaf"],
        },
        paramFilter: "beta",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "alpha-group": "Alpha Group",
              "alpha-leaf": "Alpha Setting",
              "beta-group": "Beta Group",
              "beta-leaf": "Beta Setting",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamValuePreview: (paramId: string) =>
          paramId === "beta-leaf" ? "preview-beta" : null,
      }),
    ).toEqual([
      {
        depth: 0,
        id: "beta-group",
        kind: "group",
        label: "Beta Group",
      },
      {
        depth: 1,
        editorKind: "combobox",
        id: "beta-leaf",
        kind: "value",
        label: "Beta Setting",
        valuePresentationKind: "combobox",
        valuePreview: "preview-beta",
      },
    ]);
  });

  it("marks temp placeholder rows explicitly when filtering hides real params", () => {
    const tempParamId = getTempParamDndId(
      "beta-leaf::settaParamList::unpinned",
    );

    expect(
      buildVisibleParamScenePackets({
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        paramIds: ["alpha-group", "alpha-leaf", tempParamId],
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
        },
        paramFilter: "missing",
        getParamDisplayName: () => "Alpha Setting",
        getParamValuePreview: () => null,
      }),
    ).toEqual([
      {
        depth: 0,
        id: tempParamId,
        kind: "placeholder",
        label: null,
      },
    ]);
  });

  it("keeps nested parent rows typed as groups on the unfiltered live path", () => {
    expect(
      buildVisibleParamScenePackets({
        getParamEditorKind: (paramId: string) =>
          paramId === "child-leaf" ? "codemirror" : "other",
        getParamValuePresentationKind: () => "text",
        paramIds: ["parent", "child-group", "child-leaf"],
        requiredParamIdsToPaths: {
          "child-leaf": ["parent", "child-group", "child-leaf"],
        },
        paramFilter: "",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              parent: "Parent",
              "child-group": "Child Group",
              "child-leaf": "Child Leaf",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamValuePreview: (paramId: string) =>
          paramId === "child-leaf" ? "preview-child" : null,
      }),
    ).toEqual([
      {
        depth: 0,
        id: "parent",
        kind: "group",
        label: "Parent",
      },
      {
        depth: 1,
        id: "child-group",
        kind: "group",
        label: "Child Group",
      },
      {
        depth: 2,
        editorKind: "codemirror",
        id: "child-leaf",
        kind: "value",
        label: "Child Leaf",
        valuePresentationKind: "text",
        valuePreview: "preview-child",
      },
    ]);
  });
});
