import { useStateVersion } from "models/stateVersion";
import { undoProjectState } from "thunks/undo";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function UndoButton() {
  const version = useStateVersion((x) => x.version);

  return (
    <>
      {version}
      <MenuBarButton onClick={undoProjectState}>Undo</MenuBarButton>
    </>
  );
}
