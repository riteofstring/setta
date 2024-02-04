import { useEffect } from "react";

import { useStoreApi } from "../hooks/useStore";
import type { KeyCode } from "../types";
import useKeyPress, { type UseKeyPressOptions } from "./useKeyPress";
import useReactFlow from "./useReactFlow";
interface HookParams {
  deleteKeyCode: KeyCode | null;
  multiSelectionKeyCode: KeyCode | null;
}

const deleteKeyOptions: UseKeyPressOptions = {
  actInsideInputWithModifier: false,
};

export default ({ deleteKeyCode, multiSelectionKeyCode }: HookParams): void => {
  const store = useStoreApi();
  const { deleteElements } = useReactFlow();

  const deleteKeyPressed = useKeyPress(deleteKeyCode, deleteKeyOptions);
  const multiSelectionKeyPressed = useKeyPress(multiSelectionKeyCode);

  useEffect(() => {
    if (deleteKeyPressed) {
      const { getNodes } = store.getState();
      const selectedNodes = getNodes().filter((node) => node.selected);
      deleteElements({ nodes: selectedNodes });
      store.setState({ nodesSelectionActive: false });
    }
  }, [deleteKeyPressed]);

  useEffect(() => {
    store.setState({ multiSelectionActive: multiSelectionKeyPressed });
  }, [multiSelectionKeyPressed]);
};
