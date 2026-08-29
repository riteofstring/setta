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

// The public Code section owns the editor itself. Python Canvas owns this
// labelled composite boundary, which keeps completion-failure feedback tied to
// the one target editor without reaching into the package's rendered DOM.
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
