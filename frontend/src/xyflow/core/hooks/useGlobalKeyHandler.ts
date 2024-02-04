import { useEffect } from "react";

import { useStoreApi } from "../hooks/useStore";
import type { KeyCode } from "../types";
import useKeyPress from "./useKeyPress";
interface HookParams {
  multiSelectionKeyCode: KeyCode | null;
}

export default ({ multiSelectionKeyCode }: HookParams): void => {
  const store = useStoreApi();
  const multiSelectionKeyPressed = useKeyPress(multiSelectionKeyCode);

  useEffect(() => {
    store.setState({ multiSelectionActive: multiSelectionKeyPressed });
  }, [multiSelectionKeyPressed]);
};
