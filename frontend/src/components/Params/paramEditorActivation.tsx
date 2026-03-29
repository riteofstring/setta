import { createContext, useContext, type ReactNode } from "react";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export type ParamEditorKind =
  | "codemirror"
  | "combobox"
  | "color-picker"
  | "other";

const PARAM_CODEMIRROR_TYPES = new Set<CodeObjTypeEnum>([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TextAreaParam,
]);

const PARAM_COMBOBOX_TYPES = new Set<CodeObjTypeEnum>([
  CodeObjTypeEnum.DropdownParam,
]);

type ResolveParamEditorKindOptions = {
  hasColorChoiceMenu?: boolean;
};

type ParamEditorKindCodeObjImpl = {
  colorChoices?: unknown;
  type: CodeObjTypeEnum;
};

const PixiOverlayParamEditorKindContext =
  createContext<ParamEditorKind>("other");

export function resolveParamEditorKind(
  codeObjType: CodeObjTypeEnum,
  options: ResolveParamEditorKindOptions = {},
): ParamEditorKind {
  if (PARAM_CODEMIRROR_TYPES.has(codeObjType)) {
    return "codemirror";
  }
  if (PARAM_COMBOBOX_TYPES.has(codeObjType)) {
    return "combobox";
  }
  if (
    codeObjType === CodeObjTypeEnum.ColorPickerParam &&
    options.hasColorChoiceMenu === true
  ) {
    return "color-picker";
  }
  return "other";
}

export function resolveParamEditorKindFromCodeObjImpl(
  codeObjImpl: ParamEditorKindCodeObjImpl,
): ParamEditorKind {
  return resolveParamEditorKind(codeObjImpl.type, {
    hasColorChoiceMenu:
      codeObjImpl.type === CodeObjTypeEnum.ColorPickerParam &&
      Array.isArray(codeObjImpl.colorChoices) &&
      codeObjImpl.colorChoices.length > 0,
  });
}

export function PixiOverlayParamEditorKindProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ParamEditorKind;
}) {
  return (
    <PixiOverlayParamEditorKindContext.Provider value={value}>
      {children}
    </PixiOverlayParamEditorKindContext.Provider>
  );
}

export function useShouldAutoActivateCodeMirrorOnMount(): boolean {
  return useContext(PixiOverlayParamEditorKindContext) === "codemirror";
}

export function useShouldAutoOpenComboboxOnMount(): boolean {
  return useContext(PixiOverlayParamEditorKindContext) === "combobox";
}

export function useShouldAutoOpenColorPickerOnMount(): boolean {
  return useContext(PixiOverlayParamEditorKindContext) === "color-picker";
}
