import { useKeyActivations } from "models/keyActivations";
import { useEffect } from "react";
import { saveProject } from "thunks/save";

export function useSaveLoadProjectOnKeyActivation({
  openLoadModal,
  openSaveAsModal,
}) {
  const save = useKeyActivations((x) => x.save);
  const load = useKeyActivations((x) => x.load);
  const saveAs = useKeyActivations((x) => x.saveAs);

  useEffect(() => {
    if (save) {
      saveProject();
    }
    if (load) {
      openLoadModal();
    }
    if (saveAs) {
      openSaveAsModal();
    }
  }, [save, load, saveAs]);
}
