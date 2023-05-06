import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCreateDeck } from "hooks/useCreateSectionOrDeck";
import { deleteSections } from "thunks/sections/sectionOps";
import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu({
  x,
  y,
  closeContextMenu,
  nodeIds,
  ...props
}) {
  const onClickCreateDeck = useCreateDeck();
  const onClickProps = {
    nodeIds,
    x,
    y,
    callbackBeforeExit: closeContextMenu,
    projectXY: true,
  };

  function onClickDelete() {
    deleteSections({ sectionIds: nodeIds, incrementVersion: true });
    closeContextMenu();
  }

  return (
    <ContextMenuCore x={x} y={y} closeContextMenu={closeContextMenu} {...props}>
      <DropdownMenu.Item onClick={() => onClickCreateDeck(onClickProps)}>
        Create Group
      </DropdownMenu.Item>
      <DropdownMenu.Item onClick={onClickDelete}>Delete</DropdownMenu.Item>
    </ContextMenuCore>
  );
}
