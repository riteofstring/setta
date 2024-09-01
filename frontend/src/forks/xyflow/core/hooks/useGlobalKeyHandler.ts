import { useEffect } from "react";
import { useReactFlow } from "../store";
import type { KeyCode } from "../types";
import useKeyPress from "./useKeyPress";
interface HookParams {
  multiSelectionKeyCode: KeyCode | null;
}

export default ({ multiSelectionKeyCode }: HookParams): void => {
  const multiSelectionKeyPressed = useKeyPress(multiSelectionKeyCode);

  useEffect(() => {
    useReactFlow.setState({ multiSelectionActive: multiSelectionKeyPressed });
  }, [multiSelectionKeyPressed]);
};
