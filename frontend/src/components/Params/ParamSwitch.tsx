import _ from "lodash";
import React, { useCallback } from "react";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
  toggleParamSelected,
} from "state/actions/sectionInfos";
import {
  useMisc,
  useProjectSearch,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  isBaseParamCodeObjImpl,
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

function _ParamSwitch(props) {
  const { sectionId, paramInfoId } = props;

  const errorMessages = useTypeErrors(
    (x) => x.errors[sectionId]?.params?.[paramInfoId],
  );
  const maybeErrorMessage = errorMessages?.join("\n") ?? "";
  const hasError = maybeErrorMessage.length > 0;

  const { isFocusedSearchResult, isSearchResult } = useProjectSearch((x) => {
    return {
      isFocusedSearchResult:
        x.focused?.sectionId === sectionId &&
        x.focused?.paramInfoId === paramInfoId,
      isSearchResult: x.lookup.has(
        createProjectSearchLookupKey(sectionId, paramInfoId),
      ),
    };
  }, _.isEqual);

  const { paramIsSelected, isKwarg, paramChildren, isNestedParam } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImplWithTypeGuard(
        x,
        sectionId,
        isBaseSectionWithParamsImpl,
      );
      const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
        x,
        sectionId,
        paramInfoId,
        isBaseParamCodeObjImpl,
      );
      const isNestedParam = isBaseParentCodeObjImpl(codeObjImpl);
      return {
        paramIsSelected: impl.selectedParams.includes(paramInfoId),
        isKwarg: codeObjImpl.coreNameEditable,
        paramChildren: isNestedParam ? codeObjImpl.children : [],
        isNestedParam,
      };
    }, _.isEqual);

  const hasChildren = paramChildren.length > 0;
  const handleParamSelection = useCallback(
    (e) => {
      if (useMisc.getState().isSelectingParams) {
        e.stopPropagation(); // to prevent text input from becoming active
        toggleParamSelected(sectionId, paramInfoId);
      }
    },
    [sectionId, paramInfoId],
  );

  // No need for additional useCallback since this is just a simple conditional
  const onMouseDownConditional = hasChildren ? handleParamSelection : undefined;
  const onMouseDownAlways = handleParamSelection;

  const bg = paramIsSelected
    ? "transition-colors active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white rounded-sm"
    : "transition-colors rounded-sm";

  // warnings should be AMBER
  const border = hasError
    ? "bg-red-200 dark:bg-red-800/30"
    : isFocusedSearchResult
      ? "outline outline-4 outline-green-500 dark:outline-green-500/80"
      : isSearchResult
        ? "outline outline-4 outline-blue-500 dark:outline-cyan-300/80"
        : "";

  return (
    <ParamContainer
      {...props}
      isKwarg={isKwarg}
      isNestedParam={isNestedParam}
      paramChildren={paramChildren}
      onMouseDown={onMouseDownAlways}
      maybeErrorMessage={maybeErrorMessage}
      border={border}
      bg={bg}
    >
      {isKwarg ? (
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          hasChildren={hasChildren}
          onMouseDown={onMouseDownConditional}
          border={hasChildren ? border : ""}
          bg={hasChildren ? bg : ""}
        />
      ) : (
        <ParamTextLabel
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          onMouseDown={onMouseDownConditional}
          bg={hasChildren ? bg : ""}
        />
      )}
    </ParamContainer>
  );
}

export const ParamSwitch = React.memo(_ParamSwitch, _.isEqual);
