import { useKeyActivations } from "models/keyActivations";
import { useEffect } from "react";
import { saveProject } from "thunks/save";

export function useSaveLoadProjectOnKeyActivation({ openLoadModal }) {
  const save = useKeyActivations((x) => x.save);
  const load = useKeyActivations((x) => x.load);

  useEffect(() => {
    if (save) {
      saveProject();
    }
  }, [save]);

  useEffect(() => {
    if (load) {
      openLoadModal();
    }
  }, [load]);
}
