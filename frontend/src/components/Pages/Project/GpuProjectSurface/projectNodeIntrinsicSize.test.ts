/* @vitest-environment jsdom */

import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import type { ZustandProjectState } from "state/definitions";
import { useProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createShownParamIDs,
  createSingleConfig,
  createVariant,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX,
  PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
} from "./projectGpuParamContentLayout";
import { getProjectGpuParamRowHeightForCodeObjType } from "./projectGpuParamRowHeight";
import {
  getProjectNodeIntrinsicSizeObserverNodeIds,
  measureIntrinsicElementHeight,
  measureIntrinsicElementWidth,
  resolveProjectNodeIntrinsicSize,
  shouldObserveProjectNodeIntrinsicSize,
} from "./projectNodeIntrinsicSize";
import { PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX } from "./projectSectionSceneHeaderLayout";

const CODE_PARAM_ROW_HEIGHT_PX = getProjectGpuParamRowHeightForCodeObjType({
  codeObjType: CodeObjTypeEnum.CodeParam,
  configLanguage: "python",
});

function parsePixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampDimension(
  value: number,
  minValue: number | null,
  maxValue: number | null,
): number {
  return Math.min(Math.max(value, minValue ?? 0), maxValue ?? Infinity);
}

function installMeasuredBox(
  element: HTMLElement,
  {
    autoHeight,
    autoWidth,
  }: {
    readonly autoHeight: number;
    readonly autoWidth: number;
  },
) {
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get() {
      const height = parsePixelValue(element.style.height) ?? autoHeight;
      return clampDimension(
        height,
        parsePixelValue(element.style.minHeight),
        parsePixelValue(element.style.maxHeight),
      );
    },
  });
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get() {
      const width = parsePixelValue(element.style.width) ?? autoWidth;
      return clampDimension(
        width,
        parsePixelValue(element.style.minWidth),
        parsePixelValue(element.style.maxWidth),
      );
    },
  });
  element.getBoundingClientRect = () =>
    ({
      bottom: element.offsetHeight,
      height: element.offsetHeight,
      left: 0,
      right: element.offsetWidth,
      top: 0,
      width: element.offsetWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("projectNodeIntrinsicSize", () => {
  it("measures auto height by clearing the live fixed GPU height", () => {
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 122, autoWidth: 550 });
    element.style.height = "350px";
    element.style.maxHeight = "900px";
    element.style.minHeight = "10px";

    expect(
      measureIntrinsicElementHeight(element, {
        maxHeight: 350,
        minHeight: 80,
      }),
    ).toBe(122);
    expect(element.style.height).toBe("350px");
    expect(element.style.maxHeight).toBe("900px");
    expect(element.style.minHeight).toBe("10px");
  });

  it("preserves capped auto height for content taller than the policy cap", () => {
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 1569, autoWidth: 550 });
    element.style.height = "350px";

    expect(
      measureIntrinsicElementHeight(element, {
        maxHeight: 350,
        minHeight: 80,
      }),
    ).toBe(350);
    expect(element.style.height).toBe("350px");
  });

  it("measures auto width by clearing the live fixed GPU width", () => {
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 350, autoWidth: 240 });
    element.style.width = "550px";
    element.style.maxWidth = "900px";
    element.style.minWidth = "10px";

    expect(
      measureIntrinsicElementWidth(element, {
        maxWidth: 550,
        minWidth: 120,
      }),
    ).toBe(240);
    expect(element.style.width).toBe("550px");
    expect(element.style.maxWidth).toBe("900px");
    expect(element.style.minWidth).toBe("10px");
  });

  it("observes only sections with an auto intrinsic size policy", () => {
    const projectState = projectStateWithSectionSizes({
      "fixed-section": sectionSize({ height: 120, width: 240 }),
      "auto-height-section": sectionSize({ height: "auto", width: 240 }),
      "auto-width-section": sectionSize({ height: 120, width: "auto" }),
    });

    expect(
      shouldObserveProjectNodeIntrinsicSize(projectState, "fixed-section"),
    ).toBe(false);
    expect(
      shouldObserveProjectNodeIntrinsicSize(
        projectState,
        "auto-height-section",
      ),
    ).toBe(true);
    expect(
      shouldObserveProjectNodeIntrinsicSize(projectState, "auto-width-section"),
    ).toBe(true);
    expect(
      getProjectNodeIntrinsicSizeObserverNodeIds(projectState, [
        "fixed-section",
        "auto-height-section",
        "missing-section",
        "auto-width-section",
      ]),
    ).toEqual(["auto-height-section", "auto-width-section"]);
  });

  it("uses retained param content height for auto-height canvas-owned rows", () => {
    const projectState = projectStateWithRetainedParamSection({
      rowIds: ["param-a", "param-b", "param-c"],
    });
    useProjectState.setState(projectState);
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 80, autoWidth: 260 });
    element.style.height = "80px";

    expect(resolveProjectNodeIntrinsicSize("dict-a", element)).toEqual({
      height:
        PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
        3 * CODE_PARAM_ROW_HEIGHT_PX,
    });
    expect(element.style.height).toBe("80px");
  });

  it("keeps base retained auto height chrome when a nested block reaches the bottom", () => {
    const projectState = projectStateWithNestedRetainedParamSection();
    useProjectState.setState(projectState);
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 80, autoWidth: 260 });
    element.style.height = "80px";

    expect(resolveProjectNodeIntrinsicSize("dict-a", element)).toEqual({
      height:
        PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
        PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX +
        CODE_PARAM_ROW_HEIGHT_PX,
    });
    expect(element.style.height).toBe("80px");
  });

  it("adds retained auto height chrome when root rows continue after a nested block", () => {
    const projectState = projectStateWithNestedRetainedParamSection({
      includeTrailingSibling: true,
    });
    useProjectState.setState(projectState);
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 80, autoWidth: 260 });
    element.style.height = "80px";

    expect(resolveProjectNodeIntrinsicSize("dict-a", element)).toEqual({
      height:
        PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
        4 +
        PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX +
        2 * CODE_PARAM_ROW_HEIGHT_PX,
    });
    expect(element.style.height).toBe("80px");
  });

  it("adds retained auto height chrome for multi-child nested blocks at the bottom", () => {
    const projectState = projectStateWithNestedRetainedParamSection({
      includeSecondNestedChild: true,
    });
    useProjectState.setState(projectState);
    const element = document.createElement("div");
    installMeasuredBox(element, { autoHeight: 80, autoWidth: 260 });
    element.style.height = "80px";

    expect(resolveProjectNodeIntrinsicSize("dict-a", element)).toEqual({
      height:
        PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
        4 +
        PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX +
        2 * CODE_PARAM_ROW_HEIGHT_PX,
    });
    expect(element.style.height).toBe("80px");
  });
});

function sectionSize(size: {
  readonly height: number | "auto";
  readonly width: number | "auto";
}): never {
  return size as never;
}

function projectStateWithSectionSizes(
  sizesBySectionId: Readonly<Record<string, BaseSectionImplUnion["size"]>>,
): ZustandProjectState {
  const sections: ZustandProjectState["sections"] = {};
  const sectionImpls: ZustandProjectState["sectionImpls"] = {};
  const sectionVariants: ZustandProjectState["sectionVariants"] = {};
  const sectionVariantMap: Record<string, string> = {};
  const topLevelSections: SingleConfig["projectConfig"]["topLevelSections"] =
    {};

  for (const [sectionId, size] of Object.entries(sizesBySectionId)) {
    const variantId = `${sectionId}-variant`;
    const implId = `${sectionId}-impl`;
    sections[sectionId] = createCore({
      defaultVariant: variantId,
      id: sectionId,
      name: sectionId,
      variants: [variantId],
    });
    sectionImpls[implId] = createDictSectionImpl({
      id: implId,
      size,
    });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: variantId,
      nonPresetImpls: [],
    });
    sectionVariantMap[sectionId] = variantId;
    topLevelSections[sectionId] = { h: 120, w: 240, x: 0, y: 0, zIndex: 0 };
  }

  const state = createSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap,
      topLevelSections,
    }),
    sectionImpls,
    sectionVariants,
    sections,
  }) as ZustandProjectState;
  state.previewSectionVariantMap = {};
  return state;
}

function projectStateWithRetainedParamSection({
  rowIds,
}: {
  readonly rowIds: readonly string[];
}): ZustandProjectState {
  const rootParamId = "root-param";
  const projectState = createSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { "dict-a": "dict-a-variant" },
      topLevelSections: {
        "dict-a": { h: 80, w: 260, x: 0, y: 0, zIndex: 0 },
      },
    }),
    sectionImpls: {
      "dict-a-impl": createDictSectionImpl({
        codeObjVariantMap: Object.fromEntries([
          [rootParamId, `${rootParamId}-variant`],
          ...rowIds.map((paramId) => [paramId, `${paramId}-variant`]),
        ]),
        id: "dict-a-impl",
        size: sectionSize({ height: "auto", width: 260 }),
        topLevelParamId: rootParamId,
      }),
    },
    sectionVariants: {
      "dict-a-variant": createVariant({
        id: "dict-a-variant",
        impl: "dict-a-impl",
        name: "dict-a-variant",
        nonPresetImpls: [],
      }),
    },
    sections: {
      "dict-a": createCore({
        defaultVariant: "dict-a-variant",
        id: "dict-a",
        name: "dict-a",
        variants: ["dict-a-variant"],
      }),
    },
    shownParamIds: {
      "dict-a-variant": createShownParamIDs({
        unpinned: {
          requiredParamIdsToPaths: Object.fromEntries(
            rowIds.map((paramId) => [paramId, [paramId]]),
          ),
          topLevelParamIds: [...rowIds],
        },
      }),
    },
  }) as ZustandProjectState;
  projectState.previewSectionVariantMap = {};
  addParamToProjectState(
    projectState,
    rootParamId,
    `${rootParamId}-variant`,
    `${rootParamId}-impl`,
    createNestedParamImpl(`${rootParamId}-impl`, rowIds),
  );
  for (const paramId of rowIds) {
    addParamToProjectState(
      projectState,
      paramId,
      `${paramId}-variant`,
      `${paramId}-impl`,
      createCodeParamCodeObjImpl({
        id: `${paramId}-impl`,
        name: paramId,
      }) as BaseCodeObjImplUnion,
    );
  }
  return projectState;
}

function projectStateWithNestedRetainedParamSection({
  includeSecondNestedChild = false,
  includeTrailingSibling = false,
}: {
  readonly includeSecondNestedChild?: boolean;
  readonly includeTrailingSibling?: boolean;
} = {}): ZustandProjectState {
  const ids = nestedRetainedParamIds({
    includeSecondNestedChild,
    includeTrailingSibling,
  });
  const projectState = createSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { "dict-a": "dict-a-variant" },
      topLevelSections: {
        "dict-a": { h: 80, w: 260, x: 0, y: 0, zIndex: 0 },
      },
    }),
    sectionImpls: {
      "dict-a-impl": createDictSectionImpl({
        codeObjVariantMap: ids.codeObjVariantMap,
        id: "dict-a-impl",
        size: sectionSize({ height: "auto", width: 260 }),
        topLevelParamId: ids.rootParamId,
      }),
    },
    sectionVariants: {
      "dict-a-variant": createVariant({
        id: "dict-a-variant",
        impl: "dict-a-impl",
        name: "dict-a-variant",
        nonPresetImpls: [],
      }),
    },
    sections: {
      "dict-a": createCore({
        defaultVariant: "dict-a-variant",
        id: "dict-a",
        name: "dict-a",
        variants: ["dict-a-variant"],
      }),
    },
    shownParamIds: {
      "dict-a-variant": createShownParamIDs({
        unpinned: {
          requiredParamIdsToPaths: ids.shownParamPaths,
          topLevelParamIds: ids.shownTopLevelParamIds,
        },
      }),
    },
  }) as ZustandProjectState;
  projectState.previewSectionVariantMap = {};
  addNestedRetainedParamImpls(projectState, ids);
  return projectState;
}

type NestedRetainedParamIds = {
  childParamId: string;
  codeObjVariantMap: Record<string, string>;
  nestedChildIds: string[];
  parentParamId: string;
  rootParamId: string;
  secondChildParamId: string;
  shownParamPaths: Record<string, string[]>;
  shownTopLevelParamIds: string[];
  siblingParamId: string;
};

function nestedRetainedParamIds({
  includeSecondNestedChild,
  includeTrailingSibling,
}: {
  readonly includeSecondNestedChild: boolean;
  readonly includeTrailingSibling: boolean;
}): NestedRetainedParamIds {
  const rootParamId = "root-param";
  const parentParamId = "parent-param";
  const childParamId = "child-param";
  const secondChildParamId = "second-child-param";
  const siblingParamId = "sibling-param";
  const nestedChildIds = [childParamId];
  const shownTopLevelParamIds = [parentParamId];
  const shownParamPaths: Record<string, string[]> = {
    [childParamId]: [parentParamId, childParamId],
    [parentParamId]: [parentParamId],
  };
  const codeObjVariantMap: Record<string, string> = {
    [childParamId]: `${childParamId}-variant`,
    [parentParamId]: `${parentParamId}-variant`,
    [rootParamId]: `${rootParamId}-variant`,
  };
  if (includeSecondNestedChild) {
    nestedChildIds.push(secondChildParamId);
    shownParamPaths[secondChildParamId] = [parentParamId, secondChildParamId];
    codeObjVariantMap[secondChildParamId] = `${secondChildParamId}-variant`;
  }
  if (includeTrailingSibling) {
    shownTopLevelParamIds.push(siblingParamId);
    shownParamPaths[siblingParamId] = [siblingParamId];
    codeObjVariantMap[siblingParamId] = `${siblingParamId}-variant`;
  }
  return {
    childParamId,
    codeObjVariantMap,
    nestedChildIds,
    parentParamId,
    rootParamId,
    secondChildParamId,
    shownParamPaths,
    shownTopLevelParamIds,
    siblingParamId,
  };
}

function addNestedRetainedParamImpls(
  projectState: ZustandProjectState,
  ids: NestedRetainedParamIds,
) {
  addParamToProjectState(
    projectState,
    ids.rootParamId,
    `${ids.rootParamId}-variant`,
    `${ids.rootParamId}-impl`,
    createNestedParamImpl(`${ids.rootParamId}-impl`, [ids.parentParamId]),
  );
  addParamToProjectState(
    projectState,
    ids.parentParamId,
    `${ids.parentParamId}-variant`,
    `${ids.parentParamId}-impl`,
    createNestedParamImpl(`${ids.parentParamId}-impl`, ids.nestedChildIds),
  );
  addParamToProjectState(
    projectState,
    ids.childParamId,
    `${ids.childParamId}-variant`,
    `${ids.childParamId}-impl`,
    createCodeParamCodeObjImpl({
      id: `${ids.childParamId}-impl`,
      name: ids.childParamId,
    }) as BaseCodeObjImplUnion,
  );
  if (ids.nestedChildIds.includes(ids.secondChildParamId)) {
    addParamToProjectState(
      projectState,
      ids.secondChildParamId,
      `${ids.secondChildParamId}-variant`,
      `${ids.secondChildParamId}-impl`,
      createCodeParamCodeObjImpl({
        id: `${ids.secondChildParamId}-impl`,
        name: ids.secondChildParamId,
      }) as BaseCodeObjImplUnion,
    );
  }
  if (ids.shownTopLevelParamIds.includes(ids.siblingParamId)) {
    addParamToProjectState(
      projectState,
      ids.siblingParamId,
      `${ids.siblingParamId}-variant`,
      `${ids.siblingParamId}-impl`,
      createCodeParamCodeObjImpl({
        id: `${ids.siblingParamId}-impl`,
        name: ids.siblingParamId,
      }) as BaseCodeObjImplUnion,
    );
  }
}

function createNestedParamImpl(
  id: string,
  children: readonly string[],
): BaseCodeObjImplUnion {
  return {
    children: [...children],
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    description: "",
    id,
    isPreset: false,
    name: id,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.NestedParam,
    typeAnnotation: "",
  };
}

function addParamToProjectState(
  state: ZustandProjectState,
  paramId: string,
  variantId: string,
  implId: string,
  impl: BaseCodeObjImplUnion,
) {
  state.codeObjs[paramId] = createCore({
    defaultVariant: variantId,
    displayName: "",
    id: paramId,
    name: paramId,
    variants: [variantId],
  });
  state.codeObjVariants[variantId] = createVariant({
    id: variantId,
    impl: implId,
    name: variantId,
    nonPresetImpls: [],
  });
  state.codeObjImpls[implId] = impl;
}
