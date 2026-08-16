import { createContext, useContext } from "react";

export type PythonCanvasMutationContextValue = {
  callableDraft: string;
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
    throw new Error("Python Canvas section content requires its app mutation context.");
  }
  return context;
}
