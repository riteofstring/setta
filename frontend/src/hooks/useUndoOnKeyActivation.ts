import { useKeyActivations } from "models/keyActivations";
import { useEffect } from "react";
import { redoProjectState, undoProjectState } from "thunks/undo";

export function useUndoRedoOnKeyActivation() {
  const undo = useKeyActivations((x) => x.undo);
  const redo = useKeyActivations((x) => x.redo);

  useEffect(() => {
    if (undo) {
      undoProjectState();
    }
    if (redo) {
      redoProjectState();
    }
  }, [undo, redo]);
}
