import { createContext, useContext } from "react";

import type {
  GeneratedPythonTerminalActions,
  GeneratedPythonTerminalState,
} from "./generatedPythonTerminalController";

export type GeneratedPythonTerminalContextValue = Readonly<{
  actions: GeneratedPythonTerminalActions;
  state: GeneratedPythonTerminalState;
}>;

export const GeneratedPythonTerminalContext =
  createContext<GeneratedPythonTerminalContextValue | null>(null);

export function useGeneratedPythonTerminal(): GeneratedPythonTerminalContextValue {
  const context = useContext(GeneratedPythonTerminalContext);
  if (context === null) {
    throw new Error(
      "Generated Python terminal content requires its app runtime context.",
    );
  }
  return context;
}
