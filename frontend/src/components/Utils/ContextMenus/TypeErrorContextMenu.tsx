import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { removeTypeErrorsForParam } from "state/actions/typeCheck";
import {
  useContextMenus,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import { route_set_param_ignore_type_errors } from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { ContextMenuCore } from "./ContextMenuCore";

export function TypeErrorContextMenu() {
  const { isOpen, x, y, sectionId, paramInfoId } = useContextMenus(
    (x) => x.typeError,
    _.isEqual,
  );

  const currIgnoreTypeErrors = useProjectState((x) => {
    if (!sectionId || !paramInfoId) {
      return false;
    }
    const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
    if (isBaseSectionWithParamsImpl(sectionImpl)) {
      return Boolean(sectionImpl.ignoreTypeErrors[paramInfoId]);
    }
    return false;
  });

  function onClick() {
    if (!sectionId || !paramInfoId) {
      closeAllContextMenus();
      return;
    }
    const ignoreTypeErrors = !currIgnoreTypeErrors;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
          state,
          sectionId,
          {
            ignoreTypeErrors: (curr) => {
              const next = { ...(curr ?? {}) };
              if (ignoreTypeErrors) {
                next[paramInfoId] = true;
              } else if (paramInfoId in next) {
                delete next[paramInfoId];
              }
              return next;
            },
          },
        );
      },
      send: (frontendOpId) =>
        route_set_param_ignore_type_errors({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          ignoreTypeErrors,
          frontendOpId,
        }),
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
