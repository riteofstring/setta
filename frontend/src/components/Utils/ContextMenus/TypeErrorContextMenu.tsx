import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { removeTypeErrorsForParam } from "state/actions/typeCheck";
import {
  useContextMenus,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";

export function TypeErrorContextMenu() {
  const { isOpen, x, y, paramInfoId } = useContextMenus(
    (x) => x.typeError,
    _.isEqual,
  );

  const currIgnoreTypeErrors = useProjectState((x) =>
    Boolean(x.codeInfo[paramInfoId]?.ignoreTypeErrors),
  );

  function onClick() {
    let ignoreTypeErrors;
    useProjectState.setState((state) => {
      ignoreTypeErrors = !currIgnoreTypeErrors;
      state.codeInfo[paramInfoId].ignoreTypeErrors = ignoreTypeErrors;
    });
    if (ignoreTypeErrors) {
      useTypeErrors.setState((state) => {
        removeTypeErrorsForParam(paramInfoId, state);
      });
    }

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
