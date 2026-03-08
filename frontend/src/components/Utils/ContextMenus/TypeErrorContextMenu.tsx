import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useContextMenus } from "state/definitions";
import { route_set_type_error_ignore } from "utils/generatedGoEndpoints";
import { ContextMenuCore } from "./ContextMenuCore";

export function TypeErrorContextMenu() {
  const { isOpen, x, y, sectionId, paramInfoId } = useContextMenus(
    (x) => x.typeError,
    _.isEqual,
  );

  function onClick() {
    if (!sectionId) {
      closeAllContextMenus();
      return;
    }
    route_set_type_error_ignore({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      ignoreTypeErrors: true,
    });

    closeAllContextMenus();
  }

  const itemText = "Ignore Type Errors";

  return (
    <ContextMenuCore
      x={x}
      y={y}
      isOpen={isOpen}
      closeContextMenu={closeAllContextMenus}
    >
      <Item onClick={onClick}>{itemText}</Item>
    </ContextMenuCore>
  );
}
