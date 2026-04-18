import { useParamDuplicateIndex } from "components/Params/ParamDuplicateIndexContext";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import _ from "lodash";
import { setCodeObjDisplayName, setCodeObjName } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { ParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
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
  createDictSectionImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  ProjectCodegenLanguageEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { validateParamNameInput } from "utils/nameValidation";

type DictSectionImpl = ReturnType<typeof createDictSectionImpl>;

type ParamNameInputProps = {
  border: string;
  bg: string;
  sectionId: string;
  paramInfoId: string;
  hasChildren: boolean;
  onMouseDown?: MouseEventHandler;
};

type ParamNameState = {
  configLanguage: string | null | undefined;
  isDictSection: boolean;
  topLevelParamId: string | null;
  displayName: string;
  name: string;
  isKwarg: boolean;
  pythonCodegenEnabled: boolean;
  showParamDisplayNames: boolean;
};

type ParamNameValidationOptions = Parameters<typeof validateParamNameInput>[1];

type BubblePosition = {
  top: number;
  left: number;
  visible: boolean;
};

type ResolvedParamNameState = {
  configLanguage: string | null | undefined;
  displayName: string;
  isDictSection: boolean;
  isKwarg: boolean;
  name: string;
  pythonCodegenEnabled: boolean;
  showParamDisplayNames: boolean;
  topLevelParamId: string | null;
};

type ParamNameController = {
  bubblePosition: BubblePosition;
  bubbleRef: RefObject<HTMLDivElement | null>;
  combinedErrorMessage: string;
  configLanguage: string | null | undefined;
  dummyDivId: string;
  errorClassName: string;
  hasError: boolean;
  inputValue: string;
  isDisabled: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  onEscape: (completionResult: unknown) => void;
  realDivId: string;
};

const hiddenBubblePosition: BubblePosition = {
  top: 0,
  left: 0,
  visible: false,
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

function useParamNameState(
  sectionId: string,
  paramInfoId: string,
): ParamNameState | null {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      x,
      sectionId,
      paramInfoId,
      isBaseParamCodeObjImpl,
    );
    const codeObjCore = x.codeObjs[paramInfoId];
    if (!impl || !codeObjImpl || !codeObjCore) {
      return null;
    }
    const pythonCodegenEnabled = (x.projectConfig.codegenTargets ?? []).some(
      (target) => target?.language === ProjectCodegenLanguageEnum.python,
    );
    const isDictSection = impl.type === SectionTypeEnum.Dict;
    let topLevelParamId: string | null = null;
    if (impl.type === SectionTypeEnum.Dict) {
      topLevelParamId = (impl as DictSectionImpl).topLevelParamId;
    }
    return {
      configLanguage: impl.configLanguage,
      isDictSection,
      topLevelParamId,
      displayName: codeObjCore.displayName,
      name: codeObjCore.name,
      isKwarg:
        "coreNameEditable" in codeObjImpl
          ? codeObjImpl.coreNameEditable
          : false,
      pythonCodegenEnabled,
      showParamDisplayNames: x.projectConfig.showParamDisplayNames,
    };
  }, _.isEqual);
}

function buildParamNameValidationOptions(
  paramInfoId: string,
  isKwarg: boolean,
  isDictSection: boolean,
  topLevelParamId: string | null,
  pythonCodegenEnabled: boolean,
): ParamNameValidationOptions {
  return {
    allowEmpty: isKwarg || (isDictSection && topLevelParamId === paramInfoId),
    requirePythonIdentifier: !isDictSection && pythonCodegenEnabled,
    skipPathChecks: isDictSection,
  };
}

function resolveParamNameState(
  paramNameState: ParamNameState | null,
): ResolvedParamNameState {
  if (!paramNameState) {
    return {
      configLanguage: undefined,
      displayName: "",
      isDictSection: false,
      isKwarg: false,
      name: "",
      pythonCodegenEnabled: false,
      showParamDisplayNames: false,
      topLevelParamId: null,
    };
  }
  return paramNameState;
}

function getParamNameValueState(
  displayName: string,
  name: string,
  showParamDisplayNames: boolean,
  isKwarg: boolean,
) {
  const hasDisplayName = displayName.trim().length > 0;
  const useDisplayName = showParamDisplayNames && hasDisplayName && !isKwarg;
  return {
    useDisplayName,
    value: useDisplayName ? displayName : name,
  };
}

function getParamNameValidationError(
  inputValue: string,
  useDisplayName: boolean,
  validationOptions: ParamNameValidationOptions,
): string | null {
  if (useDisplayName) {
    return null;
  }
  return validateParamNameInput(inputValue, validationOptions);
}

function getParamNameDuplicateValidationError(
  paramInfoId: string,
  inputValue: string,
  duplicateIndex: ParamDuplicateIndex,
  useDisplayName: boolean,
  validationError: string | null,
): string | null {
  if (useDisplayName || validationError) {
    return null;
  }
  return getParamNameDuplicateError(paramInfoId, inputValue, duplicateIndex);
}

function getParamNameErrorMessages(
  backendErrors: Array<string> | undefined,
  validationError: string | null,
  duplicateError: string | null,
): Array<string> {
  if (backendErrors && backendErrors.length > 0) {
    return [...backendErrors];
  }
  const errorMessages: Array<string> = [];
  if (validationError) {
    errorMessages.push(validationError);
  }
  if (duplicateError) {
    errorMessages.push(duplicateError);
  }
  return errorMessages;
}

function getParamNameErrorState({
  backendErrors,
  duplicateIndex,
  inputValue,
  paramInfoId,
  useDisplayName,
  validationOptions,
}: {
  backendErrors: Array<string> | undefined;
  duplicateIndex: ParamDuplicateIndex;
  inputValue: string;
  paramInfoId: string;
  useDisplayName: boolean;
  validationOptions: ParamNameValidationOptions;
}) {
  const validationError = getParamNameValidationError(
    inputValue,
    useDisplayName,
    validationOptions,
  );
  const duplicateError = getParamNameDuplicateValidationError(
    paramInfoId,
    inputValue,
    duplicateIndex,
    useDisplayName,
    validationError,
  );
  const errorMessages = getParamNameErrorMessages(
    backendErrors,
    validationError,
    duplicateError,
  );
  const combinedErrorMessage = errorMessages.join("\n");
  const hasError = combinedErrorMessage.length > 0;
  return {
    combinedErrorMessage,
    errorClassName: getParamNameErrorClassName(hasError),
    hasError,
  };
}

function getParamNameErrorClassName(hasError: boolean): string {
  if (!hasError) {
    return "";
  }
  return "text-red-500 dark:text-red-300 border-red-400 [&_*]:!text-red-500 dark:[&_*]:!text-red-300";
}

function getBubbleScale(offsetSize: number, rectSize: number): number {
  if (offsetSize <= 0) {
    return 1;
  }
  return rectSize / offsetSize;
}

function clampBubbleLeft(
  nextLeft: number,
  maxLeft: number,
  margin: number,
): number {
  if (nextLeft > maxLeft) {
    return Math.max(margin, maxLeft);
  }
  if (nextLeft < margin) {
    return margin;
  }
  return nextLeft;
}

function computeBubblePosition(
  sectionId: string,
  realDivId: string,
  dummyDivId: string,
  bubbleEl: HTMLDivElement | null,
): BubblePosition | null {
  const anchorEl =
    document.getElementById(realDivId) ?? document.getElementById(dummyDivId);
  const containerEl = document.getElementById(`${sectionId}-CustomResizable`);
  if (!anchorEl || !bubbleEl || !containerEl) {
    return null;
  }
  const anchorRect = anchorEl.getBoundingClientRect();
  const bubbleRect = bubbleEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const scaleX = getBubbleScale(containerEl.offsetWidth, containerRect.width);
  const scaleY = getBubbleScale(containerEl.offsetHeight, containerRect.height);
  const margin = 6;
  const localLeft = (anchorRect.left - containerRect.left) / scaleX;
  const localTop = (anchorRect.top - containerRect.top) / scaleY;
  const localAnchorHeight = anchorRect.height / scaleY;
  const localBubbleWidth = bubbleRect.width / scaleX;
  const maxLeft = containerEl.offsetWidth - localBubbleWidth - margin;
  return {
    top: localTop + localAnchorHeight + margin,
    left: clampBubbleLeft(localLeft, maxLeft, margin),
    visible: true,
  };
}

function useParamNameBubblePosition(
  hasError: boolean,
  combinedErrorMessage: string,
  sectionId: string,
  realDivId: string,
  dummyDivId: string,
) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubblePosition, setBubblePosition] =
    useState<BubblePosition>(hiddenBubblePosition);

  const updateBubblePosition = useCallback(() => {
    if (!hasError) {
      return;
    }
    const nextBubblePosition = computeBubblePosition(
      sectionId,
      realDivId,
      dummyDivId,
      bubbleRef.current,
    );
    if (!nextBubblePosition) {
      return;
    }
    setBubblePosition(nextBubblePosition);
  }, [dummyDivId, hasError, realDivId, sectionId]);

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

  return { bubbleRef, bubblePosition };
}

function getParamNameElementIds(sectionId: string, paramInfoId: string) {
  return {
    dummyDivId: `ParamNameInput-${sectionId}-${paramInfoId}`,
    realDivId: `CodeMirror-${sectionId}-${paramInfoId}-keyName`,
  };
}

function hasBlockingParamNameError(
  paramInfoId: string,
  value: string,
  validationOptions: ParamNameValidationOptions,
  duplicateIndex: ParamDuplicateIndex,
): boolean {
  if (validateParamNameInput(value, validationOptions)) {
    return true;
  }
  return (
    getParamNameDuplicateError(paramInfoId, value, duplicateIndex) !== null
  );
}

function useParamNameInputHandlers({
  canEditStructure,
  duplicateIndex,
  hasParamNameState,
  inputValue,
  isKwarg,
  paramInfoId,
  sectionId,
  setInputValue,
  showParamDisplayNames,
  useDisplayName,
  validationOptions,
  value,
}: {
  canEditStructure: boolean;
  duplicateIndex: ParamDuplicateIndex;
  hasParamNameState: boolean;
  inputValue: string;
  isKwarg: boolean;
  paramInfoId: string;
  sectionId: string;
  setInputValue: (value: string) => void;
  showParamDisplayNames: boolean;
  useDisplayName: boolean;
  validationOptions: ParamNameValidationOptions;
  value: string;
}) {
  const onChange = useCallback(
    (nextValue: string) => {
      setInputValue(nextValue);
      if (!hasParamNameState || !canEditStructure) {
        return;
      }
      if (showParamDisplayNames && !isKwarg) {
        debouncedSetParamDisplayName(paramInfoId, nextValue);
        return;
      }
      if (
        hasBlockingParamNameError(
          paramInfoId,
          nextValue,
          validationOptions,
          duplicateIndex,
        )
      ) {
        return;
      }
      debouncedSetParamName(paramInfoId, nextValue);
    },
    [
      canEditStructure,
      duplicateIndex,
      hasParamNameState,
      isKwarg,
      paramInfoId,
      setInputValue,
      showParamDisplayNames,
      validationOptions,
    ],
  );

  const onBlur = useCallback(() => {
    if (!hasParamNameState) {
      setInputValue(value);
      return;
    }
    if (useDisplayName) {
      return;
    }
    const normalizedValue = inputValue.trim();
    if (
      hasBlockingParamNameError(
        paramInfoId,
        normalizedValue,
        validationOptions,
        duplicateIndex,
      )
    ) {
      setInputValue(value);
      return;
    }
    if (normalizedValue !== value) {
      debouncedSetParamName.flush?.();
      return;
    }
    if (inputValue !== value) {
      setInputValue(value);
    }
  }, [
    duplicateIndex,
    hasParamNameState,
    inputValue,
    paramInfoId,
    setInputValue,
    useDisplayName,
    validationOptions,
    value,
  ]);

  const onEscape = useCallback(
    (completionResult: unknown) => {
      if (!completionResult) {
        focusOnSection(null, sectionId, false);
      }
    },
    [sectionId],
  );

  return { onChange, onBlur, onEscape };
}

function ParamNameErrorBubble({
  bubblePosition,
  bubbleRef,
  combinedErrorMessage,
  hasError,
  sectionId,
}: {
  bubblePosition: BubblePosition;
  bubbleRef: RefObject<HTMLDivElement | null>;
  combinedErrorMessage: string;
  hasError: boolean;
  sectionId: string;
}) {
  if (!hasError) {
    return null;
  }
  return createPortal(
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
    document.getElementById(`${sectionId}-CustomResizable`) ?? document.body,
  );
}

function useParamNameController(
  sectionId,
  paramInfoId,
): ParamNameController | null {
  const paramNameState = useParamNameState(sectionId, paramInfoId);
  const hasParamNameState = paramNameState !== null;
  const resolvedState = resolveParamNameState(paramNameState);
  const { useDisplayName, value } = getParamNameValueState(
    resolvedState.displayName,
    resolvedState.name,
    resolvedState.showParamDisplayNames,
    resolvedState.isKwarg,
  );
  const { canEditStructure } = useShareCapabilities();
  const [inputValue, setInputValue] = useState(value);
  const backendErrors = useNameValidationErrors(
    (state) => state.paramErrors[paramInfoId],
  );
  const validationOptions = buildParamNameValidationOptions(
    paramInfoId,
    resolvedState.isKwarg,
    resolvedState.isDictSection,
    resolvedState.topLevelParamId,
    resolvedState.pythonCodegenEnabled,
  );
  const duplicateIndex = useParamDuplicateIndex();
  const { combinedErrorMessage, errorClassName, hasError } =
    getParamNameErrorState({
      backendErrors,
      duplicateIndex,
      inputValue,
      paramInfoId,
      useDisplayName,
      validationOptions,
    });
  const { dummyDivId, realDivId } = getParamNameElementIds(
    sectionId,
    paramInfoId,
  );
  useEffect(() => {
    setInputValue(value);
  }, [value]);
  const { bubbleRef, bubblePosition } = useParamNameBubblePosition(
    hasError,
    combinedErrorMessage,
    sectionId,
    realDivId,
    dummyDivId,
  );
  const { onChange, onBlur, onEscape } = useParamNameInputHandlers({
    canEditStructure,
    duplicateIndex,
    hasParamNameState,
    inputValue,
    isKwarg: resolvedState.isKwarg,
    paramInfoId,
    sectionId,
    setInputValue,
    showParamDisplayNames: resolvedState.showParamDisplayNames,
    useDisplayName,
    validationOptions,
    value,
  });
  if (!hasParamNameState) {
    return null;
  }
  return {
    bubblePosition,
    bubbleRef,
    combinedErrorMessage,
    configLanguage: resolvedState.configLanguage,
    dummyDivId,
    errorClassName,
    hasError,
    inputValue,
    isDisabled: !canEditStructure,
    onBlur,
    onChange,
    onEscape,
    realDivId,
  };
}

function getParamNameLayoutClassName(
  hasChildren: boolean,
  layoutPadding: string,
): string {
  if (hasChildren) {
    return `section-key-value grid-row-start-1 ${layoutPadding}`;
  }
  return "section-key";
}

function getParamNameInputClassNames(
  bg: string,
  border: string,
  errorClassName: string,
  hasChildren: boolean,
  isDisabled: boolean,
) {
  const layoutClassName = getParamNameLayoutClassName(hasChildren, "px-[2px]");
  const selectionClassName = isDisabled ? "" : "cursor-text select-text";
  return {
    dummyCodeClassName: `${NO_PAN_CLASS_NAME} ${bg} ${border} min-w-0 self-end placeholder:text-setta-300 dark:placeholder:text-setta-600 ${layoutClassName} nodrag peer/nameinput ${selectionClassName} break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400 ${errorClassName}`,
    realCodeClassName: `${NO_PAN_CLASS_NAME} nodrag cursor-text self-end select-text [&_*]:!outline-0 [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs min-w-0 placeholder:text-setta-300 dark:placeholder:text-setta-600 py-[.125rem] ${layoutClassName} peer/nameinput font-mono dark:focus-visible:border-blue-400 ${errorClassName}`,
  };
}

function getParamNameUnderlineClassName(
  hasChildren: boolean,
  hasError: boolean,
): string {
  const layoutClassName = getParamNameLayoutClassName(hasChildren, "mx-[2px]");
  const errorUnderlineClassName = hasError ? "border-red-400" : "";
  return `${layoutClassName} border-box self-end border-b border-setta-200/50 peer-focus-within/nameinput:border-blue-400 dark:border-setta-600/30 ${errorUnderlineClassName}`;
}

function LoadedParamNameInput({
  border,
  bg,
  controller,
  hasChildren,
  onMouseDown,
  paramInfoId,
  sectionId,
}: ParamNameInputProps & { controller: ParamNameController }) {
  const { dummyCodeClassName, realCodeClassName } = getParamNameInputClassNames(
    bg,
    border,
    controller.errorClassName,
    hasChildren,
    controller.isDisabled,
  );
  const underlineClassName = getParamNameUnderlineClassName(
    hasChildren,
    controller.hasError,
  );
  return (
    <div className="contents">
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={controller.inputValue}
        defaultVal={"Add Key"}
        onChange={controller.onChange}
        onBlur={controller.onBlur}
        onEscape={controller.onEscape}
        dummyDivId={controller.dummyDivId}
        singleLine={true}
        wrapLines={true}
        dummyCodeClassName={dummyCodeClassName}
        realCodeClassName={realCodeClassName}
        color="green"
        language={controller.configLanguage}
        autocomplete={false}
        isKeyName={true}
        isDisabled={controller.isDisabled}
        onMouseDown={onMouseDown}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <span className={underlineClassName} />
      <ParamNameErrorBubble
        bubblePosition={controller.bubblePosition}
        bubbleRef={controller.bubbleRef}
        combinedErrorMessage={controller.combinedErrorMessage}
        hasError={controller.hasError}
        sectionId={sectionId}
      />
    </div>
  );
}

export function ParamNameInput(props: ParamNameInputProps) {
  const controller = useParamNameController(props.sectionId, props.paramInfoId);
  if (!controller) {
    return null;
  }
  return <LoadedParamNameInput {...props} controller={controller} />;
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
      callOpenAPI(
        setCodeObjName({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            codeObjId,
            name: normalizedName,
            frontendOpId,
          },
        } as Parameters<typeof setCodeObjName>[0]),
      ),
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
        callOpenAPI(
          setCodeObjDisplayName({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              codeObjId,
              displayName: nextDisplayName,
              frontendOpId,
            },
          } as Parameters<typeof setCodeObjDisplayName>[0]),
        ),
    });
  },
  200,
);
