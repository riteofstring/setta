import { useParamDuplicateIndex } from "components/Params/ParamDuplicateIndexContext";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEventHandler,
} from "react";
import { createPortal } from "react-dom";
import type { ParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import {
  dispatchOptimisticProjectStateUpdate,
  getCodeObjCore,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useNameValidationErrors, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_PAN_CLASS_NAME,
} from "utils/constants";
import { focusOnSection } from "utils/focusManager";
import {
  route_set_code_obj_display_name,
  route_set_code_obj_name,
} from "utils/generatedEndpoints";
import {
  isBaseDictSectionImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  ProjectCodegenLanguageEnum,
} from "utils/generatedTypes";
import { validateParamNameInput } from "utils/nameValidation";

type ParamNameInputProps = {
  border: string;
  bg: string;
  sectionId: string;
  paramInfoId: string;
  hasChildren: boolean;
  onMouseDown?: MouseEventHandler;
};

function getParamNameDuplicateError(
  paramInfoId: string,
  value: string,
  duplicateIndex: ParamDuplicateIndex,
): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (!(paramInfoId in duplicateIndex.parentById)) {
    return null;
  }
  const parentId = duplicateIndex.parentById[paramInfoId];
  if (!parentId) {
    return null;
  }
  const namesForParent = duplicateIndex.namesByParent[parentId];
  if (!namesForParent) {
    return null;
  }
  const matchingIds = namesForParent[normalized];
  if (!matchingIds) {
    return null;
  }
  if (matchingIds.length === 1 && matchingIds[0] === paramInfoId) {
    return null;
  }
  return `Param name "${normalized}" already exists under this parent.`;
}

export function ParamNameInput({
  border,
  bg,
  sectionId,
  paramInfoId,
  hasChildren,
  onMouseDown,
}: ParamNameInputProps) {
  const {
    configLanguage,
    isDictSection,
    displayName,
    name,
    isKwarg,
    pythonCodegenEnabled,
    showParamDisplayNames,
    topLevelParamId,
    // variantIsFrozen,
  } = useProjectState((x) => {
    // const { isFrozen, configLanguage } = getSectionVariant(sectionId, x);
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
    const codeObjCore = getCodeObjCore(x, paramInfoId);
    const pythonCodegenEnabled = x.projectConfig.codegenTargets.some(
      (target) => target.language === ProjectCodegenLanguageEnum.python,
    );
    return {
      // variantIsFrozen: isFrozen,
      configLanguage: impl.configLanguage,
      isDictSection: isBaseDictSectionImpl(impl),
      topLevelParamId: isBaseDictSectionImpl(impl)
        ? impl.topLevelParamId
        : null,
      displayName: codeObjCore.displayName,
      name: codeObjCore.name,
      isKwarg: codeObjImpl.coreNameEditable,
      pythonCodegenEnabled,
      showParamDisplayNames: x.projectConfig.showParamDisplayNames,
    };
  }, _.isEqual);

  const hasDisplayName = displayName.trim().length > 0;
  const useDisplayName = showParamDisplayNames && hasDisplayName && !isKwarg;
  const value = useDisplayName ? displayName : name;
  const [inputValue, setInputValue] = useState(value);
  const { canEditStructure } = useShareCapabilities();
  const backendErrors = useNameValidationErrors(
    (state) => state.paramErrors[paramInfoId],
  );
  const allowEmpty =
    isKwarg || (isDictSection && topLevelParamId === paramInfoId);
  const requirePythonIdentifier = !isDictSection && pythonCodegenEnabled;
  const validationOptions = {
    allowEmpty,
    requirePythonIdentifier,
    skipPathChecks: isDictSection,
  };
  const duplicateIndex = useParamDuplicateIndex();
  const validationError = useDisplayName
    ? null
    : validateParamNameInput(inputValue, validationOptions);
  const duplicateError =
    useDisplayName || validationError
      ? null
      : getParamNameDuplicateError(paramInfoId, inputValue, duplicateIndex);
  const errorMessages: Array<string> = [];
  if (backendErrors && backendErrors.length > 0) {
    errorMessages.push(...backendErrors);
  } else {
    if (validationError) {
      errorMessages.push(validationError);
    }
    if (duplicateError) {
      errorMessages.push(duplicateError);
    }
  }
  const combinedErrorMessage = errorMessages.join("\n");
  const hasError = combinedErrorMessage.length > 0;
  let errorClassName = "";
  if (hasError) {
    errorClassName =
      "text-red-500 dark:text-red-300 border-red-400 [&_*]:!text-red-500 dark:[&_*]:!text-red-300";
  }
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{
    top: number;
    left: number;
    visible: boolean;
  }>({
    top: 0,
    left: 0,
    visible: false,
  });
  const dummyDivId = `ParamNameInput-${sectionId}-${paramInfoId}`;
  const realDivId = `CodeMirror-${sectionId}-${paramInfoId}-keyName`;
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const updateBubblePosition = useCallback(() => {
    if (!hasError) {
      return;
    }
    const anchorEl =
      document.getElementById(realDivId) ?? document.getElementById(dummyDivId);
    const containerEl = document.getElementById(`${sectionId}-CustomResizable`);
    const bubbleEl = bubbleRef.current;
    if (!anchorEl || !bubbleEl || !containerEl) {
      return;
    }
    const anchorRect = anchorEl.getBoundingClientRect();
    const bubbleRect = bubbleEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const scaleX =
      containerEl.offsetWidth > 0
        ? containerRect.width / containerEl.offsetWidth
        : 1;
    const scaleY =
      containerEl.offsetHeight > 0
        ? containerRect.height / containerEl.offsetHeight
        : 1;
    const margin = 6;
    const localLeft = (anchorRect.left - containerRect.left) / scaleX;
    const localTop = (anchorRect.top - containerRect.top) / scaleY;
    const localAnchorHeight = anchorRect.height / scaleY;
    const localBubbleWidth = bubbleRect.width / scaleX;
    const nextTop = localTop + localAnchorHeight + margin;
    let nextLeft = localLeft;
    const maxLeft = containerEl.offsetWidth - localBubbleWidth - margin;
    if (nextLeft > maxLeft) {
      nextLeft = Math.max(margin, maxLeft);
    }
    if (nextLeft < margin) {
      nextLeft = margin;
    }
    setBubblePosition({
      top: nextTop,
      left: nextLeft,
      visible: true,
    });
  }, [dummyDivId, hasError, realDivId]);

  useLayoutEffect(() => {
    if (!hasError) {
      return;
    }
    updateBubblePosition();
  }, [combinedErrorMessage, hasError, updateBubblePosition]);

  useEffect(() => {
    if (!hasError) {
      return;
    }
    const handleScrollOrResize = () => {
      updateBubblePosition();
    };
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [hasError, updateBubblePosition]);

  function onChange(v: string) {
    setInputValue(v);
    if (!canEditStructure) {
      return;
    }
    if (showParamDisplayNames && !isKwarg) {
      debouncedSetParamDisplayName(paramInfoId, v);
      return;
    }
    const nextValidationError = validateParamNameInput(v, validationOptions);
    if (nextValidationError) {
      return;
    }
    const nextDuplicateError = getParamNameDuplicateError(
      paramInfoId,
      v,
      duplicateIndex,
    );
    if (nextDuplicateError) {
      return;
    }
    debouncedSetParamName(paramInfoId, v);
  }

  function onBlur() {
    if (useDisplayName) {
      return;
    }
    const normalizedValue = inputValue.trim();
    const nextValidationError = validateParamNameInput(
      normalizedValue,
      validationOptions,
    );
    if (nextValidationError) {
      setInputValue(value);
      return;
    }
    const nextDuplicateError = getParamNameDuplicateError(
      paramInfoId,
      normalizedValue,
      duplicateIndex,
    );
    if (nextDuplicateError) {
      setInputValue(value);
      return;
    }
    if (normalizedValue !== value) {
      debouncedSetParamName.flush?.();
    } else if (inputValue !== value) {
      setInputValue(value);
    }
  }

  function onEscape(completionResult) {
    if (!completionResult) {
      focusOnSection(null, sectionId, false);
    }
  }

  // const isSelectingParams = useMisc((x) => x.isSelectingParams);
  // const isDisabled = isSelectingParams || variantIsFrozen;
  const isDisabled = !canEditStructure;
  const borderClassName = `${hasChildren ? "mx-[2px]" : ""} border-box border-b border-setta-200/50 focus-within:border-blue-400 dark:border-setta-600/30 ${hasError ? "border-red-400" : ""}`;

  return (
    <>
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={inputValue}
        defaultVal={"Add Key"}
        onChange={onChange}
        onBlur={onBlur}
        onEscape={onEscape}
        dummyDivId={dummyDivId}
        singleLine={true}
        wrapLines={true}
        dummyCodeClassName={`${NO_PAN_CLASS_NAME} ${bg} ${border} min-w-0 self-end placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "section-key-value grid-row-start-1 px-[2px]" : "section-key"} nodrag peer/nameinput ${!isDisabled ? "cursor-text select-text" : ""} break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] ${borderClassName} ${errorClassName}`}
        realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag cursor-text self-end select-text [&_*]:!outline-0 [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs min-w-0 placeholder:text-setta-300 dark:placeholder:text-setta-600 py-[.125rem] ${hasChildren ? "section-key-value grid-row-start-1 px-[2px]" : "section-key"} peer/nameinput font-mono ${borderClassName} ${errorClassName}`}
        color="green"
        language={configLanguage}
        autocomplete={false}
        isKeyName={true}
        isDisabled={isDisabled}
        onMouseDown={onMouseDown}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      {hasError &&
        createPortal(
          <div
            ref={bubbleRef}
            className="pointer-events-none absolute z-50 max-w-[220px] whitespace-pre-line rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium leading-snug text-red-700 shadow-sm dark:border-red-900 dark:bg-[#120000] dark:text-red-200"
            style={{
              top: bubblePosition.top,
              left: bubblePosition.left,
              opacity: bubblePosition.visible ? 1 : 0,
            }}
          >
            <span className="absolute -top-1 left-3 h-2 w-2 rotate-45 border-l border-t border-red-300 bg-red-50 dark:border-red-900 dark:bg-[#120000]" />
            {combinedErrorMessage}
          </div>,
          document.getElementById(`${sectionId}-CustomResizable`) ??
            document.body,
        )}
    </>
  );
}

const debouncedSetParamName = _.debounce((codeObjId: string, name: string) => {
  const normalizedName = name.trim();
  const previousName =
    useProjectState.getState().codeObjs[codeObjId]?.name ?? "";
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const codeObj = state.codeObjs[codeObjId];
      if (!codeObj) {
        return;
      }
      codeObj.name = normalizedName;
    },
    rollback: (state) => {
      const codeObj = state.codeObjs[codeObjId];
      if (!codeObj) {
        return;
      }
      if (codeObj.name !== normalizedName) {
        return;
      }
      codeObj.name = previousName;
    },
    send: (frontendOpId) =>
      route_set_code_obj_name({
        projectConfigId: getCurrProjectConfigId(),
        codeObjId,
        name: normalizedName,
        frontendOpId,
      }),
  });
}, 200);

const debouncedSetParamDisplayName = _.debounce(
  (codeObjId: string, displayName: string) => {
    let nextDisplayName = displayName;
    if (displayName.trim().length === 0) {
      nextDisplayName = "";
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const codeObj = state.codeObjs[codeObjId];
        if (!codeObj) {
          return;
        }
        codeObj.displayName = nextDisplayName;
      },
      send: (frontendOpId) =>
        route_set_code_obj_display_name({
          projectConfigId: getCurrProjectConfigId(),
          codeObjId,
          displayName: nextDisplayName,
          frontendOpId,
        }),
    });
  },
  200,
);
