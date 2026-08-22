import { createContext, useContext } from "react";
import type { TextValueCompletionProvider } from "@setta/workspace";

export type PythonCanvasMutationContextValue = {
  callableCompletionProvider: (
    callableId: string,
  ) => TextValueCompletionProvider | undefined;
  callableCompletionError: (callableId: string) => string | null;
  callableMutationError: (callableId: string) => string | null;
  callablePending: (callableId: string) => boolean;
  callableDraft: (callableId: string) => string;
  onCallableAlternateCommit: (callableId: string, value: string) => void;
  onCallableCommit: (callableId: string, value: string) => void;
  onCallableDraftChange: (callableId: string, value: string) => void;
  onCallableRevert: (callableId: string) => void;
  onParameterExpressionChange: (
    callableId: string,
    parameterId: string,
    value: string,
  ) => void;
  onParameterNameChange: (
    callableId: string,
    parameterId: string,
    name: string,
  ) => void;
};

export const PythonCanvasMutationContext =
  createContext<PythonCanvasMutationContextValue | null>(null);

export function usePythonCanvasMutationContext(): PythonCanvasMutationContextValue {
  const context = useContext(PythonCanvasMutationContext);
  if (context === null) {
    throw new Error(
      "Python Canvas section content requires its app mutation context.",
    );
  }
  return context;
}
