import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useContextMenus, useProjectState } from "state/definitions";
import { route_set_type_error_ignore } from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { ContextMenuCore } from "./ContextMenuCore";

export function TypeErrorContextMenu() {
  const { isOpen, x, y, sectionId, paramInfoId } = useContextMenus(
    (x) => x.typeError,
    _.isEqual,
  );

  const currIgnoreTypeErrors = useProjectState((x) => {
    if (!sectionId) {
      return false;
    }
    const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
    if (isBaseSectionWithParamsImpl(sectionImpl)) {
      if (paramInfoId === null) {
        return sectionImpl.ignoreTypeErrors.callable;
      }
      if (paramInfoId in sectionImpl.ignoreTypeErrors.params) {
        return Boolean(sectionImpl.ignoreTypeErrors.params[paramInfoId]);
      }
    }
    return false;
  });

  function onClick() {
    if (!sectionId) {
      closeAllContextMenus();
      return;
    }
    const ignoreTypeErrors = !currIgnoreTypeErrors;
    route_set_type_error_ignore({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      ignoreTypeErrors,
    });

    closeAllContextMenus();
  }

  const itemText = currIgnoreTypeErrors
    ? "Enable Type Errors"
    : "Ignore Type Errors";

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
