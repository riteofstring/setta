import { createContext, useContext, type ReactNode } from "react";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export type ParamEditorKind = "codemirror" | "other";

const PARAM_CODEMIRROR_TYPES = new Set<CodeObjTypeEnum>([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TextAreaParam,
]);

const AutoActivateCodeMirrorOnMountContext = createContext(false);

export function resolveParamEditorKind(
  codeObjType: CodeObjTypeEnum,
): ParamEditorKind {
  return PARAM_CODEMIRROR_TYPES.has(codeObjType) ? "codemirror" : "other";
}

export function AutoActivateCodeMirrorOnMountProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: boolean;
}) {
  return (
    <AutoActivateCodeMirrorOnMountContext.Provider value={value}>
      {children}
    </AutoActivateCodeMirrorOnMountContext.Provider>
  );
}

export function useShouldAutoActivateCodeMirrorOnMount(): boolean {
  return useContext(AutoActivateCodeMirrorOnMountContext);
}
