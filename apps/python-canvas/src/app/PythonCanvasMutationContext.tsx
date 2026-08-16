import { createContext, useContext } from "react";
import type { TextValueCompletionProvider } from "@setta/workspace";

export type PythonCanvasMutationContextValue = {
  callableCompletionProvider: TextValueCompletionProvider | undefined;
  callableDraft: string;
  completionError: string | null;
  mutationError: string | null;
  pendingDescription: string | null;
  onCallableDraftChange: (value: string) => void;
  onCallableCommit: (value: string) => void;
  onParameterExpressionChange: (parameterId: string, value: string) => void;
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
