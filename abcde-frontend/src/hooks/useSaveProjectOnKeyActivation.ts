import { useKeyActivations } from "models/keyActivations";
import { useEffect } from "react";
import { saveProject } from "thunks/save";

export function useSaveProjectOnKeyActivation() {
  const save = useKeyActivations((x) => x.save);

  useEffect(() => {
    if (save) {
      saveProject();
    }
  }, [save]);
}
