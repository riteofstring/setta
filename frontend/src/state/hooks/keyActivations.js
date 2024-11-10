import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";

export function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}
