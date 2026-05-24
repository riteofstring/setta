import {
  CodeObjTypeEnum,
  isBaseParentCodeObjImpl,
  type BaseCodeObjImplUnion,
} from "utils/generatedTypes";
import {
  WORKSPACE_PARAM_SUPPORT,
  type WorkspaceParamSupportDeclaration,
  type WorkspacePassiveValuePreview,
} from "./workspaceSceneTypes";

type PassivePreviewBuilder = (
  impl: BaseCodeObjImplUnion,
) => WorkspacePassiveValuePreview;

const PASSIVE_PREVIEW_BUILDERS: Record<string, PassivePreviewBuilder> = {
  [CodeObjTypeEnum.PasswordParam]: buildPasswordPreview,
  [CodeObjTypeEnum.SwitchParam]: buildSwitchPreview,
  [CodeObjTypeEnum.ColorPickerParam]: buildColorPreview,
  [CodeObjTypeEnum.DropdownParam]: buildDropdownPreview,
  [CodeObjTypeEnum.SliderParam]: buildNumberPreview,
  [CodeObjTypeEnum.RotaryParam]: buildNumberPreview,
  [CodeObjTypeEnum.ButtonParam]: buildButtonPreview,
  [CodeObjTypeEnum.NestedParam]: buildNestedPreview,
  [CodeObjTypeEnum.CodeParam]: buildCodePreviewValue,
  [CodeObjTypeEnum.TextParam]: buildTextPreview,
  [CodeObjTypeEnum.DateParam]: buildTextPreview,
  [CodeObjTypeEnum.TimeParam]: buildTextPreview,
  [CodeObjTypeEnum.TextAreaParam]: buildTextPreview,
};

export function getWorkspaceParamSupportDeclaration(
  impl: BaseCodeObjImplUnion,
): WorkspaceParamSupportDeclaration {
  if (
    impl.type === CodeObjTypeEnum.ColorPickerParam &&
    !hasColorChoices(impl)
  ) {
    return {
      canvasSupport: { passive: "preview", active: "dom-native-overlay" },
      activeInputStrategy: "dom-native-overlay",
      commitMode: "onExplicitApply",
      controlKind: "color-swatch",
      primaryHitIntent: "open-dom-overlay",
    };
  }
  return (
    WORKSPACE_PARAM_SUPPORT[impl.type] ?? {
      canvasSupport: {
        passive: "unsupported-placeholder",
        active: "unsupported",
      },
      activeInputStrategy: "unsupported",
      commitMode: "none",
      controlKind: "unsupported",
      primaryHitIntent: "unsupported",
    }
  );
}

export function derivePassiveValuePreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return (
    PASSIVE_PREVIEW_BUILDERS[impl.type]?.(impl) ?? {
      kind: "unsupported",
      text: "",
      swatchColor: null,
      choices: [],
      masked: false,
    }
  );
}

function buildPasswordPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "password",
    text:
      getStringValue(impl).length > 0 || getBooleanField(impl, "hasSecret")
        ? "********"
        : "",
    swatchColor: null,
    choices: [],
    masked: true,
  };
}

function buildSwitchPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  const value = getStringValue(impl).toLowerCase();
  return {
    kind: "boolean",
    text: value === "true" || value === "1" ? "On" : "Off",
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildColorPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  const color = getStringValue(impl);
  return {
    kind: "color",
    text: color,
    swatchColor: color.trim().length > 0 ? color : null,
    choices: getColorChoiceValues(impl),
    masked: false,
  };
}

function buildDropdownPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "choice",
    text: getStringValue(impl),
    swatchColor: null,
    choices: getStringArrayField(impl, "choices"),
    masked: false,
  };
}

function buildNumberPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "number",
    text: getStringValue(impl),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildButtonPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "button",
    text: getStringField(impl, "label") || getStringField(impl, "name"),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildNestedPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  const children = isBaseParentCodeObjImpl(impl) ? impl.children ?? [] : [];
  return {
    kind: "nested",
    text: `${children.length} fields`,
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildCodePreviewValue(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "code",
    text: getStringValue(impl),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function buildTextPreview(
  impl: BaseCodeObjImplUnion,
): WorkspacePassiveValuePreview {
  return {
    kind: "text",
    text: getStringValue(impl),
    swatchColor: null,
    choices: [],
    masked: false,
  };
}

function hasStringValue(
  impl: BaseCodeObjImplUnion,
): impl is BaseCodeObjImplUnion & {
  value: string;
} {
  return typeof (impl as { value?: unknown }).value === "string";
}

function getStringValue(impl: BaseCodeObjImplUnion) {
  return hasStringValue(impl) ? impl.value : getStringField(impl, "defaultVal");
}

function getStringField(impl: BaseCodeObjImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function getBooleanField(impl: BaseCodeObjImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : false;
}

function getStringArrayField(impl: BaseCodeObjImplUnion, key: string) {
  const value = (impl as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function hasColorChoices(impl: BaseCodeObjImplUnion) {
  const value = (impl as { colorChoices?: unknown }).colorChoices;
  return Array.isArray(value) && value.length > 0;
}

function getColorChoiceValues(impl: BaseCodeObjImplUnion) {
  const value = (impl as { colorChoices?: unknown }).colorChoices;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const color = record.color ?? record.value;
      return typeof color === "string" ? color : null;
    })
    .filter((entry): entry is string => entry !== null);
}
