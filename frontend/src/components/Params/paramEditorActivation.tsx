import { createContext, useContext, type ReactNode } from "react";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export type ParamEditorKind = "codemirror" | "combobox" | "other";

const PARAM_CODEMIRROR_TYPES = new Set<CodeObjTypeEnum>([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TextAreaParam,
]);

const PARAM_COMBOBOX_TYPES = new Set<CodeObjTypeEnum>([
  CodeObjTypeEnum.DropdownParam,
]);

const PixiOverlayParamEditorKindContext =
  createContext<ParamEditorKind>("other");

export function resolveParamEditorKind(
  codeObjType: CodeObjTypeEnum,
): ParamEditorKind {
  if (PARAM_CODEMIRROR_TYPES.has(codeObjType)) {
    return "codemirror";
  }
  if (PARAM_COMBOBOX_TYPES.has(codeObjType)) {
    return "combobox";
  }
  return "other";
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
