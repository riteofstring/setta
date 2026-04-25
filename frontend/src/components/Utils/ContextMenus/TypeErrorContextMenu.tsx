import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { setTypeErrorIgnore } from "openapi/http";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useContextMenus } from "state/definitions";
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
    callOpenAPI(
      setTypeErrorIgnore({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          ignoreTypeErrors: true,
        },
      } as Parameters<typeof setTypeErrorIgnore>[0]),
    );
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
