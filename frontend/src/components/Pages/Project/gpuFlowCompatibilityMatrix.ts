import { PARAM_CONTAINER_STRUCTURAL_CODE_OBJ_TYPES } from "components/Params/paramContainerMetadata";
import {
  getSectionParamUIRendererFamily,
  getSectionParamUIRendererTypes,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import { getGpuFlowSectionAreaRendererTypes } from "components/Section/Container/sectionAreaRendererMetadata";
import {
  getMetaControlContentCodeObjTypes,
  getMetaControlContentRenderFamily,
  type MetaControlRendererFamily,
} from "components/Section/Layouts/MetaControl/metaControlRendererMetadata";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  type CodeObjType,
  type SectionType,
} from "utils/generatedTypes";

type GpuFlowSectionCompatibilityExpectation = {
  display: string;
  nativeInteractions: readonly string[];
  canvasInteractions: readonly string[];
};

export type GpuFlowSectionCompatibilityEntry =
  GpuFlowSectionCompatibilityExpectation & {
    hasAreaRenderer: boolean;
    hasCompatibilityExpectation: boolean;
    sectionType: SectionType;
  };

type GpuFlowParamCompatibilityExpectation = {
  display: string;
  firstInteraction: string;
  surfaces: readonly string[];
};

export type GpuFlowParamCompatibilityEntry =
  GpuFlowParamCompatibilityExpectation & {
    codeObjType: CodeObjType;
    hasCompatibilityExpectation: boolean;
    hasMetaControlRenderer: boolean;
    hasSectionParamUIRenderer: boolean;
    hasStructuralContainer: boolean;
    metaControlRendererFamily: MetaControlRendererFamily | null;
    sectionParamUIRendererFamily: SectionParamUIRendererFamily | null;
  };

const STANDARD_CANVAS_INTERACTIONS = [
  "scroll-pan",
  "click-pan",
  "direct-move",
  "resize",
  "selection",
  "dnd",
  "edge-interaction",
] as const;

const SECTION_COMPATIBILITY_EXPECTATIONS_BY_TYPE = {
  [SectionTypeEnum.Callable]: {
    display: "callable params and execution chrome",
    nativeInteractions: ["param editing", "run controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Dict]: {
    display: "dictionary param rows",
    nativeInteractions: ["param editing", "nested param reorder"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.ListRoot]: {
    display: "list-root container chrome",
    nativeInteractions: ["child section sort"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Group]: {
    display: "group container chrome",
    nativeInteractions: ["child section sort"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.StateMachineStart]: {
    display: "state-machine start node",
    nativeInteractions: ["state-machine handle controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.StateMachineGate]: {
    display: "state-machine gate node",
    nativeInteractions: ["state-machine handle controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.StateMachineEnd]: {
    display: "state-machine end node",
    nativeInteractions: ["state-machine handle controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Image]: {
    display: "image preview",
    nativeInteractions: ["media controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Chart]: {
    display: "chart surface",
    nativeInteractions: ["chart controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Draw]: {
    display: "draw canvas controls",
    nativeInteractions: ["draw tools", "pointer drawing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.TextBlock]: {
    display: "rich text block",
    nativeInteractions: ["text editing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Prompt]: {
    display: "prompt editor",
    nativeInteractions: ["text editing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.MetaControl]: {
    display: "meta-control surface",
    nativeInteractions: ["control first interaction"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Social]: {
    display: "social feed surface",
    nativeInteractions: ["social controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.GlobalVariables]: {
    display: "global variable params",
    nativeInteractions: ["param editing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Code]: {
    display: "CodeMirror code editor",
    nativeInteractions: ["code editing", "attached terminal"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.GenPythonCode]: {
    display: "generated Python code editor",
    nativeInteractions: ["code editing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.GenPythonMetadata]: {
    display: "generated Python metadata editor",
    nativeInteractions: ["metadata editing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Terminal]: {
    display: "terminal emulator",
    nativeInteractions: ["terminal input"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.IFrame]: {
    display: "iframe surface",
    nativeInteractions: ["iframe pointer and keyboard input"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Chat]: {
    display: "unified chat surface",
    nativeInteractions: ["chat input", "chat scroll"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Browser]: {
    display: "browser/file surface",
    nativeInteractions: ["browser navigation", "file selection"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Plugin]: {
    display: "plugin iframe/native UI surface",
    nativeInteractions: ["plugin controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.TaskBoard]: {
    display: "task board surface",
    nativeInteractions: ["task board controls"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
  [SectionTypeEnum.Spreadsheet]: {
    display: "spreadsheet grid",
    nativeInteractions: ["spreadsheet editing"],
    canvasInteractions: STANDARD_CANVAS_INTERACTIONS,
  },
} satisfies Record<SectionType, GpuFlowSectionCompatibilityExpectation>;

const SECTION_COMPATIBILITY_EXPECTATIONS: Partial<
  Record<SectionType, GpuFlowSectionCompatibilityExpectation>
> = SECTION_COMPATIBILITY_EXPECTATIONS_BY_TYPE;

const PARAM_COMPATIBILITY_EXPECTATIONS_BY_TYPE = {
  [CodeObjTypeEnum.CodeCallable]: {
    display: "callable implementation body",
    firstInteraction: "callable editor activation",
    surfaces: ["callable-section"],
  },
  [CodeObjTypeEnum.CodeParam]: {
    display: "code parameter editor",
    firstInteraction: "CodeMirror focus and typing",
    surfaces: ["section-param-ui", "meta-control"],
  },
  [CodeObjTypeEnum.TextParam]: {
    display: "single text parameter editor",
    firstInteraction: "text focus and typing",
    surfaces: ["section-param-ui", "meta-control"],
  },
  [CodeObjTypeEnum.DateParam]: {
    display: "date parameter control",
    firstInteraction: "date input or calendar selection",
    surfaces: ["section-param-ui", "meta-control", "ui-config"],
  },
  [CodeObjTypeEnum.TimeParam]: {
    display: "time parameter control",
    firstInteraction: "time input or display interaction",
    surfaces: ["section-param-ui", "meta-control", "ui-config"],
  },
  [CodeObjTypeEnum.ButtonParam]: {
    display: "button/action control",
    firstInteraction: "button click fires once",
    surfaces: ["meta-control", "configured-control", "ui-config"],
  },
  [CodeObjTypeEnum.SliderParam]: {
    display: "slider control",
    firstInteraction: "thumb drag commits value",
    surfaces: [
      "section-param-ui",
      "meta-control",
      "configured-control",
      "ui-config",
    ],
  },
  [CodeObjTypeEnum.RotaryParam]: {
    display: "rotary control",
    firstInteraction: "rotary drag commits value",
    surfaces: ["section-param-ui", "meta-control", "configured-control"],
  },
  [CodeObjTypeEnum.SwitchParam]: {
    display: "switch control",
    firstInteraction: "switch click toggles once",
    surfaces: ["section-param-ui", "meta-control"],
  },
  [CodeObjTypeEnum.ColorPickerParam]: {
    display: "color picker control",
    firstInteraction: "color choice opens and selects",
    surfaces: [
      "section-param-ui",
      "meta-control",
      "configured-control",
      "ui-config",
    ],
  },
  [CodeObjTypeEnum.DropdownParam]: {
    display: "dropdown control",
    firstInteraction: "combobox opens and selects",
    surfaces: [
      "section-param-ui",
      "meta-control",
      "configured-control",
      "ui-config",
    ],
  },
  [CodeObjTypeEnum.PasswordParam]: {
    display: "password input",
    firstInteraction: "typing or reveal action",
    surfaces: ["section-param-ui", "meta-control"],
  },
  [CodeObjTypeEnum.TextAreaParam]: {
    display: "multi-line text editor",
    firstInteraction: "textarea CodeMirror focus and typing",
    surfaces: ["section-param-ui", "meta-control"],
  },
  [CodeObjTypeEnum.DropzoneParam]: {
    display: "dropzone control",
    firstInteraction: "drag-over and drop",
    surfaces: ["section-param-ui", "meta-control", "ui-config"],
  },
  [CodeObjTypeEnum.NestedParam]: {
    display: "nested parameter container",
    firstInteraction: "expand, collapse, and nested reorder",
    surfaces: ["param-container", "param-dnd"],
  },
} satisfies Record<CodeObjType, GpuFlowParamCompatibilityExpectation>;

const PARAM_COMPATIBILITY_EXPECTATIONS: Partial<
  Record<CodeObjType, GpuFlowParamCompatibilityExpectation>
> = PARAM_COMPATIBILITY_EXPECTATIONS_BY_TYPE;

const EMPTY_SECTION_COMPATIBILITY: GpuFlowSectionCompatibilityExpectation = {
  display: "",
  nativeInteractions: [],
  canvasInteractions: [],
};

const EMPTY_PARAM_COMPATIBILITY: GpuFlowParamCompatibilityExpectation = {
  display: "",
  firstInteraction: "",
  surfaces: [],
};

export function getGpuFlowSectionCompatibilityMatrix(): readonly GpuFlowSectionCompatibilityEntry[] {
  const areaRendererTypes = new Set(getGpuFlowSectionAreaRendererTypes());
  return (Object.values(SectionTypeEnum) as SectionType[]).map(
    (sectionType) => {
      const expectation = SECTION_COMPATIBILITY_EXPECTATIONS[sectionType];
      return {
        ...EMPTY_SECTION_COMPATIBILITY,
        ...expectation,
        hasAreaRenderer: areaRendererTypes.has(sectionType),
        hasCompatibilityExpectation: expectation !== undefined,
        sectionType,
      };
    },
  );
}

export function getGpuFlowParamCompatibilityMatrix(): readonly GpuFlowParamCompatibilityEntry[] {
  const sectionParamUIRendererTypes = new Set(getSectionParamUIRendererTypes());
  const metaControlRendererTypes = new Set(getMetaControlContentCodeObjTypes());
  const structuralContainerTypes = new Set<CodeObjType>(
    PARAM_CONTAINER_STRUCTURAL_CODE_OBJ_TYPES,
  );
  return (Object.values(CodeObjTypeEnum) as CodeObjType[]).map(
    (codeObjType) => {
      const expectation = PARAM_COMPATIBILITY_EXPECTATIONS[codeObjType];
      const sectionParamUIRendererFamily =
        getSectionParamUIRendererFamily(codeObjType);
      const metaControlRendererFamily =
        getMetaControlContentRenderFamily(codeObjType);
      return {
        ...EMPTY_PARAM_COMPATIBILITY,
        ...expectation,
        codeObjType,
        hasCompatibilityExpectation: expectation !== undefined,
        hasMetaControlRenderer: metaControlRendererTypes.has(codeObjType),
        hasSectionParamUIRenderer: sectionParamUIRendererTypes.has(codeObjType),
        hasStructuralContainer: structuralContainerTypes.has(codeObjType),
        metaControlRendererFamily,
        sectionParamUIRendererFamily,
      };
    },
  );
}
