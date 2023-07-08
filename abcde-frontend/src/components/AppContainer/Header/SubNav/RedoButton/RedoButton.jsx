import { redoProjectState } from "thunks/undo";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function RedoButton() {
  return (
    <>
      <MenuBarButton onClick={redoProjectState}>Redo</MenuBarButton>
    </>
  );
}
