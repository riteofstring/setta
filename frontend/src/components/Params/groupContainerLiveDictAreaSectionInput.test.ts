import { CodeObjTypeEnum, SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  buildLiveDictAreaSectionDisplayNames,
  buildLiveDictAreaSectionInput,
  buildLiveDictAreaSectionValuePresentationKinds,
  buildLiveDictAreaSectionValuePreviews,
  resolveLiveDictAreaValuePreview,
  resolveLiveDictAreaValueSwatch,
} from "./groupContainerLiveDictAreaSectionInput";

describe("groupContainerLiveDictAreaSectionInput", () => {
  it("collects unique top-level and nested param display names for the live dict-area section", () => {
    const getParamDisplayName = vi.fn((paramId: string) => `${paramId}-label`);

    const result = buildLiveDictAreaSectionDisplayNames({
      getParamDisplayName,
      requiredParamIdsToPaths: {
        leaf: ["group", "leaf"],
        shared: ["group", "shared"],
      },
      topLevelParamIds: ["group", "root"],
    });

    expect(result).toEqual({
      group: "group-label",
      leaf: "leaf-label",
      root: "root-label",
      shared: "shared-label",
    });
    expect(
      new Set(getParamDisplayName.mock.calls.map(([paramId]) => paramId)),
    ).toEqual(new Set(["group", "root", "leaf", "shared"]));
    expect(getParamDisplayName).toHaveBeenCalledTimes(4);
  });

  it("builds the live dict-area section input with the existing connectability and fallback display-name rules", () => {
    const handleColumnResizeStart = vi.fn();

    const result = buildLiveDictAreaSectionInput({
      bgColor: "bg-surface",
      canEditLayout: true,
      canEditStructure: true,
      displayNamesById: {
        "edge-param": "Edge Param",
        "pinned-param": "Pinned Param",
      },
      editorKindsById: {
        "edge-param": "other",
        "pinned-param": "combobox",
        "unpinned-param": "other",
      },
      edgeInputParams: ["edge-param"],
      edgeInputPorts: [{ id: "edge-param", label: "Edge Param" }],
      edgeOutputPorts: [{ id: "output-port", label: "Output Port" }],
      handleColumnResizeStart,
      hideUnpinnedParams: false,
      isSelectingParams: true,
      paramFilter: "pin",
      pinnedRequiredParamIdsToPaths: {
        "pinned-param": ["pinned-param"],
      },
      pinnedTopLevelParamIds: ["pinned-param"],
      positionAndSizeLocked: false,
      sectionId: "section-1",
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: ["edge-param"],
      styleColor: "amber",
      unpinnedParamsAreaMinHeight: 96,
      unpinnedRequiredParamIdsToPaths: {
        "unpinned-param": ["unpinned-param"],
      },
      unpinnedTopLevelParamIds: ["unpinned-param"],
      valuePresentationKindsById: {
        "edge-param": "text",
        "pinned-param": "combobox",
        "unpinned-param": "switch",
      },
      valuePreviewsById: {
        "pinned-param": "42",
      },
      valueSwatchesById: {
        "pinned-param": "#2563eb",
      },
    });

    expect(result.canConnect).toBe(false);
    expect(result.handleColumnResizeStart).toBe(handleColumnResizeStart);
    expect(result.inputPorts).toEqual([
      { id: "edge-param", label: "Edge Param" },
    ]);
    expect(result.outputPorts).toEqual([
      { id: "output-port", label: "Output Port" },
    ]);
    expect(result.getParamEditorKind("pinned-param")).toBe("combobox");
    expect(result.getParamDisplayName("edge-param")).toBe("Edge Param");
    expect(result.getParamDisplayName("missing-param")).toBe("missing-param");
    expect(result.getParamValuePresentationKind("pinned-param")).toBe(
      "combobox",
    );
    expect(result.getParamValuePreview("pinned-param")).toBe("42");
    expect(result.getParamValuePreview("missing-param")).toBeNull();
    expect(result.getParamValueSwatch("pinned-param")).toBe("#2563eb");
    expect(result.getParamValueSwatch("missing-param")).toBeNull();
    expect(result.pinned).toEqual({
      requiredParamIdsToPaths: {
        "pinned-param": ["pinned-param"],
      },
      topLevelParamIds: ["pinned-param"],
    });
    expect(result.unpinned).toEqual({
      canEditLayout: true,
      configuredMinHeight: 96,
      pinnedRequiredParamIdsToPaths: {
        "pinned-param": ["pinned-param"],
      },
      pinnedTopLevelParamIds: ["pinned-param"],
      positionAndSizeLocked: false,
      requiredParamIdsToPaths: {
        "unpinned-param": ["unpinned-param"],
      },
      topLevelParamIds: ["unpinned-param"],
    });
  });

  it("collects value presentation kinds for every visible live dict-area param exactly once", () => {
    const getParamValuePresentationKind = vi.fn(
      (paramId: string): "combobox" | "switch" | "text" => {
        if (paramId === "switch-leaf") {
          return "switch";
        }
        if (paramId === "dropdown-leaf") {
          return "combobox";
        }
        return "text";
      },
    );

    expect(
      buildLiveDictAreaSectionValuePresentationKinds({
        getParamValuePresentationKind,
        requiredParamIdsToPaths: {
          "dropdown-leaf": ["group", "dropdown-leaf"],
          "switch-leaf": ["group", "switch-leaf"],
        },
        topLevelParamIds: ["group"],
      }),
    ).toEqual({
      "dropdown-leaf": "combobox",
      group: "text",
      "switch-leaf": "switch",
    });
    expect(
      new Set(
        getParamValuePresentationKind.mock.calls.map(([paramId]) => paramId),
      ),
    ).toEqual(new Set(["group", "dropdown-leaf", "switch-leaf"]));
  });

  it("collects only non-empty live value previews for row-body scene packets", () => {
    expect(
      buildLiveDictAreaSectionValuePreviews({
        getParamValuePreview: (paramId: string) =>
          (
            ({
              alpha: resolveLiveDictAreaValuePreview({
                codeObjType: CodeObjTypeEnum.TextParam,
                value: "  hello world  ",
              }),
              beta: null,
              gamma: resolveLiveDictAreaValuePreview({
                codeObjType: CodeObjTypeEnum.TextParam,
                value: "line 1\nline 2",
              }),
            }) as Record<string, string | null>
          )[paramId] ?? null,
        requiredParamIdsToPaths: {
          alpha: ["alpha"],
          beta: ["beta"],
          gamma: ["group", "gamma"],
        },
        topLevelParamIds: ["group", "alpha"],
      }),
    ).toEqual({
      alpha: "hello world",
      gamma: "line 1 line 2",
    });
  });

  it("masks password params while preserving non-empty text previews", () => {
    expect(
      resolveLiveDictAreaValuePreview({
        codeObjType: CodeObjTypeEnum.PasswordParam,
        value: "super-secret",
      }),
    ).toBe("\u2022\u2022\u2022\u2022\u2022\u2022");
    expect(
      resolveLiveDictAreaValuePreview({
        codeObjType: CodeObjTypeEnum.TextParam,
        value: "  1.0  ",
      }),
    ).toBe("1.0");
    expect(
      resolveLiveDictAreaValuePreview({
        codeObjType: CodeObjTypeEnum.TextParam,
        value: "   ",
      }),
    ).toBeNull();
  });

  it("uses color-picker choice descriptions for previews and keeps swatches separate", () => {
    expect(
      resolveLiveDictAreaValuePreview({
        codeObjType: CodeObjTypeEnum.ColorPickerParam,
        colorChoices: [
          { color: "#ef4444", description: "Red" },
          { color: "#22c55e", description: "Green" },
        ],
        value: "#22c55e",
      }),
    ).toBe("Green");
    expect(
      resolveLiveDictAreaValueSwatch({
        codeObjType: CodeObjTypeEnum.ColorPickerParam,
        colorChoices: [
          { color: "#ef4444", description: "Red" },
          { color: "#22c55e", description: "Green" },
        ],
        value: "#22c55e",
      }),
    ).toBe("#22c55e");
    expect(
      resolveLiveDictAreaValuePreview({
        codeObjType: CodeObjTypeEnum.ColorPickerParam,
        colorChoices: [
          { color: "#ef4444", description: "Red" },
          { color: "#22c55e", description: "Green" },
        ],
        value: "#000000",
      }),
    ).toBe("Red");
    expect(
      resolveLiveDictAreaValueSwatch({
        codeObjType: CodeObjTypeEnum.ColorPickerParam,
        colorChoices: [
          { color: "#ef4444", description: "Red" },
          { color: "#22c55e", description: "Green" },
        ],
        value: "#000000",
      }),
    ).toBe("#ef4444");
  });
});
