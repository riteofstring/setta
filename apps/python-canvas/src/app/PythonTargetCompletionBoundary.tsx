import { createContext, useContext, type ReactNode } from "react";

export const pythonTargetCompletionErrorId =
  "python-canvas-target-completion-error";

const PythonTargetCompletionErrorContext = createContext<string | null>(null);

export function PythonTargetCompletionErrorProvider({
  children,
  error,
}: {
  children: ReactNode;
  error: string | null;
}) {
  return (
    <PythonTargetCompletionErrorContext.Provider value={error}>
      {children}
    </PythonTargetCompletionErrorContext.Provider>
  );
}

export function PythonTargetCompletionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const error = useContext(PythonTargetCompletionErrorContext);
  return (
    <div
      aria-describedby={
        error === null ? undefined : pythonTargetCompletionErrorId
      }
      aria-invalid={error === null ? undefined : true}
      aria-label="Python target editor"
      className="python-canvas-target-editor-boundary"
      role="group"
    >
      {children}
    </div>
  );
}
