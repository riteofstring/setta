import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { scheduleGpuFlowPortLocalRectUpdate } from "gpuFlow/ports/portGeometry";
import _ from "lodash";
import { clearTextFieldCompletion } from "openapi/http";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import { setParametersRequestWaitingForLSP } from "state/actions/lsp";
import { setCallableAndRefreshProjectState } from "state/actions/project/callable";
import {
  getCodeObjCore,
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  useShareSession,
  useTemporaryMiscState,
  useToolArgumentPreview,
  useTypeErrors,
} from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useSectionImplIsFrozen } from "state/hooks/sectionVariants";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_PAN_CLASS_NAME,
  getSectionSearchHeightKey,
  getSectionStylePreviewColorKey,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

type SectionSearchInputState = {
  displayedCallableName: string;
  valueNameInconsistent: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  onEscape: (completionResult: boolean) => void;
  onTab: (value: string, completionResult: boolean) => void;
  keyComboActions: {
    Enter: (value: string) => void;
    "Alt-Enter": (value: string) => void;
  };
  clearApplyIndicator: () => void;
};

export function SectionSearch({
  sectionId,
  callable,
  syncDomPortGeometry = true,
}: {
  sectionId: string;
  callable: string | null;
  syncDomPortGeometry?: boolean;
}) {
  const variantIsFrozen = useSectionImplIsFrozen(sectionId);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const styleColor = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    return impl.styleColor ?? null;
  });
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const darkMode = useLocalStorage((x) => x.darkMode);
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );
  const lspEnabled = !isDeploymentMode;
  function onEnter(value: string) {
    setCallable(sectionId, value, lspEnabled);
  }
  function onShiftEnter(value: string) {
    setCallable(sectionId, value, lspEnabled, true);
  }
  return (
    <SectionSearchCore
      divId={`${sectionId}-search`}
      sectionId={sectionId}
      callable={callable}
      onEnter={onEnter}
      onShiftEnter={onShiftEnter}
      dummyCodeClassName={`${NO_PAN_CLASS_NAME} single-cell-child rounded-2xl border border-solid ${
        hasSectionStyleTheme
          ? "border-[color:var(--setta-section-style-border)]"
          : "border-setta-100 dark:border-setta-800"
      } bg-white py-1 dark:bg-setta-950 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]`}
      realCodeClassName={`${NO_PAN_CLASS_NAME} single-cell-child nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid ${
        hasSectionStyleTheme
          ? "border-[color:var(--setta-section-style-outline)]"
          : "border-blue-500 dark:border-blue-400/50"
      } bg-white mx-[.125rem] py-1 dark:bg-setta-950 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit`}
      isDisabled={variantIsFrozen || !lspEnabled}
      lspEnabled={lspEnabled}
      syncDomPortGeometry={syncDomPortGeometry}
    />
  );
}

function useSectionSearchMeasurements(
  searchRef: RefObject<HTMLElement | null>,
  sectionId: string,
  heightKey: string,
  syncDomPortGeometry: boolean,
) {
  useLayoutEffect(() => {
    const node = searchRef.current;
    if (!node) {
      useTemporaryMiscState.setState({ [heightKey]: 0 });
      return;
    }
    const handleScope = node.closest(".agentic-handle-scope");
    let lastMeasuredHeight: number | null = null;
    let pendingAgenticHandleFrame: number | null = null;
    const updateAgenticHandleTop = () => {
      if (!(handleScope instanceof HTMLElement)) {
        return;
      }
      let centerY = node.offsetHeight / 2;
      let el: HTMLElement | null = node;
      for (let i = 0; i < 20; i += 1) {
        if (el === handleScope) {
          break;
        }
        centerY += el.offsetTop;
        const next = el.offsetParent;
        if (!(next instanceof HTMLElement)) {
          el = null;
          break;
        }
        el = next;
      }
      if (el !== handleScope) {
        const nodeRect = handleScope.getBoundingClientRect();
        const searchRect = node.getBoundingClientRect();
        centerY = searchRect.top - nodeRect.top + searchRect.height / 2;
      }
      const nextTopPx = Math.round(centerY);
      const nextTopCss = `${nextTopPx}px`;
      const currentTopCss = handleScope.style
        .getPropertyValue("--agentic-handle-top")
        .trim();
      if (currentTopCss === nextTopCss) {
        return;
      }
      handleScope.style.setProperty("--agentic-handle-top", nextTopCss);
      if (syncDomPortGeometry) {
        scheduleGpuFlowPortLocalRectUpdate([sectionId]);
      }
    };
    const updateHeight = () => {
      const style = window.getComputedStyle(node);
      const marginHeight =
        (Number.parseFloat(style.marginTop) || 0) +
        (Number.parseFloat(style.marginBottom) || 0);
      const measuredHeight = node.offsetHeight + marginHeight;
      const nextHeight = Math.ceil(measuredHeight);
      if (lastMeasuredHeight === nextHeight) {
        return;
      }
      lastMeasuredHeight = nextHeight;
      useTemporaryMiscState.setState({
        [heightKey]: nextHeight > 0 ? nextHeight : 0,
      });
    };
    const updateMeasurements = () => {
      updateHeight();
      updateAgenticHandleTop();
    };
    updateMeasurements();
    pendingAgenticHandleFrame = requestAnimationFrame(() => {
      pendingAgenticHandleFrame = null;
      updateAgenticHandleTop();
    });
    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (pendingAgenticHandleFrame !== null) {
        cancelAnimationFrame(pendingAgenticHandleFrame);
      }
      useTemporaryMiscState.setState({ [heightKey]: 0 });
      if (handleScope instanceof HTMLElement) {
        handleScope.style.removeProperty("--agentic-handle-top");
        if (syncDomPortGeometry) {
          scheduleGpuFlowPortLocalRectUpdate([sectionId]);
        }
      }
    };
  }, [heightKey, searchRef, sectionId, syncDomPortGeometry]);
}

function buildSectionSearchTooltipContent(
  hasCallableError: boolean,
  callableErrorMessage: string,
  codeInfoName: string,
  description: string,
): Parameters<typeof getFloatingBoxHandlers> {
  if (!hasCallableError) {
    return [{ title: codeInfoName, content: description }];
  }
  return [
    {
      content: callableErrorMessage,
      wrapperClassName:
        "!border-red-300 dark:!border-red-900 [&_.tooltip-footer]:!text-red-500 dark:[&_.tooltip-footer]:!text-red-800 dark:[&_.tooltip-footer]:!border-red-950 !bg-red-50/90 dark:!bg-[#120000]/90 [&_.tooltip-copy]:!text-red-400 dark:[&_.tooltip-copy]:!text-red-300 [&>.tooltip-copy]:hover:!bg-transparent",
      contentClassName: "!text-red-700 dark:!text-red-300 font-mono",
    },
    { title: codeInfoName, content: description },
  ];
}

function useSectionSearchInputState({
  codeInfoName,
  lspEnabled,
  onEnter,
  onShiftEnter,
  sectionId,
}: {
  codeInfoName: string;
  lspEnabled: boolean;
  onEnter: (x: string) => void;
  onShiftEnter: (x: string) => void;
  sectionId: string;
}): SectionSearchInputState {
  const [valueNameInconsistent, setValueNameInconsistent] = useState(false);
  const [draftCallableName, setDraftCallableName] = useState<string | null>(
    null,
  );
  const shouldResetValueOnBlur = useRef(false);
  const debouncedSetValueNameInconsistent = useCallback(
    _.debounce((isInconsistent: boolean) => {
      setValueNameInconsistent(isInconsistent);
    }, 1000),
    [setValueNameInconsistent],
  );

  function clearApplyIndicator() {
    debouncedSetValueNameInconsistent.cancel();
    setValueNameInconsistent(false);
  }

  function syncCallableName(value: string, cancelDebounced = false) {
    if (cancelDebounced) {
      clearApplyIndicator();
      return;
    }
    debouncedSetValueNameInconsistent(value !== codeInfoName);
  }

  function resetCallableName() {
    setDraftCallableName(null);
    syncCallableName(codeInfoName, true);
  }

  useEffect(() => {
    resetCallableName();
  }, [codeInfoName]);

  function onBlur() {
    if (!shouldResetValueOnBlur.current) {
      return;
    }
    resetCallableName();
    shouldResetValueOnBlur.current = false;
    if (!lspEnabled) {
      return;
    }
    void callOpenAPI(
      clearTextFieldCompletion({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId: null,
        },
      } as Parameters<typeof clearTextFieldCompletion>[0]),
    );
  }

  function onEscape(completionResult: boolean) {
    if (completionResult) {
      return;
    }
    resetCallableName();
    shouldResetValueOnBlur.current = true;
    // TODO: Re-enable focusOnSection(null, sectionId, false) once tabbing logic is restored.
  }

  function onTab(value: string, completionResult: boolean) {
    if (completionResult || !value) {
      return;
    }
    shouldResetValueOnBlur.current = false;
    clearApplyIndicator();
    onEnter(value);
  }

  function onChange(value: string) {
    setDraftCallableName(value);
    syncCallableName(value);
  }

  const displayedCallableName =
    draftCallableName !== null ? draftCallableName : codeInfoName;

  return {
    displayedCallableName,
    valueNameInconsistent,
    onBlur,
    onChange,
    onEscape,
    onTab,
    keyComboActions: {
      Enter: (value: string) => {
        clearApplyIndicator();
        onEnter(value);
      },
      "Alt-Enter": (value: string) => {
        clearApplyIndicator();
        onShiftEnter(value);
      },
    },
    clearApplyIndicator,
  };
}

function SectionSearchRightIndicator({
  onCallableErrorContextMenu,
  showCallableErrorIndicator,
  showStatusIndicator,
  valueNameInconsistent,
  waitingForResult,
}: {
  onCallableErrorContextMenu: (e: MouseEvent<HTMLSpanElement>) => void;
  showCallableErrorIndicator: boolean;
  showStatusIndicator: boolean;
  valueNameInconsistent: boolean;
  waitingForResult: boolean;
}) {
  if (!showCallableErrorIndicator && !showStatusIndicator) {
    return null;
  }
  return (
    <div className="single-cell-child pointer-events-none mr-2 flex items-center gap-1 self-center justify-self-end">
      {showCallableErrorIndicator && (
        <span
          className="pointer-events-auto grid h-[18px] w-[18px] place-items-center rounded-full bg-red-500/80 text-white"
          onContextMenu={onCallableErrorContextMenu}
        >
          <BiError className="h-[14px] w-[14px]" />
        </span>
      )}
      {showStatusIndicator && (
        <span className="relative grid h-[22px] w-[22px] place-items-center">
          {valueNameInconsistent && (
            <span className="setta-callable-ready-icon">
              <i className="gg-corner-right-down" />
            </span>
          )}
          {waitingForResult && (
            <span className="absolute inset-0 grid place-items-center rounded bg-white dark:bg-setta-950">
              <i className="gg-spinner text-blue-500/70" />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function SectionSearchCore({
  sectionId,
  callable,
  onEnter,
  onShiftEnter,
  dummyCodeClassName,
  realCodeClassName,
  isDisabled,
  divId,
  lspEnabled,
  syncDomPortGeometry,
}: {
  sectionId: string;
  callable: string | null;
  onEnter: (x: string) => void;
  onShiftEnter: (x: string) => void;
  dummyCodeClassName: string;
  realCodeClassName: string;
  isDisabled: boolean;
  divId: string;
  lspEnabled: boolean;
  syncDomPortGeometry: boolean;
}) {
  const searchRef = useRef<HTMLElement | null>(null);
  const heightKey = getSectionSearchHeightKey(sectionId);
  useSectionSearchMeasurements(
    searchRef,
    sectionId,
    heightKey,
    syncDomPortGeometry,
  );
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const {
    name: baseCodeInfoName,
    description,
    configLanguage,
  } = useProjectState((x) => {
    const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
      true,
    );
    const { configLanguage } = sectionImpl;
    if (callable) {
      const codeObj = getCodeObjCore(x, callable);
      const impl = getCurrEffectiveCodeObjImplIfPresent(
        x,
        sectionId,
        callable,
        true,
      );
      if (!impl) {
        return { name: "", description: "", configLanguage };
      }
      const { description } = impl;
      return { name: codeObj.name, description, configLanguage };
    }
    return { name: "", description: "", configLanguage };
  }, _.isEqual);
  const previewCallableName = useToolArgumentPreview((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return null;
    }
    const entry = previewState.previewCallableNameBySectionId[sectionId];
    return entry ? entry.value : null;
  });
  const codeInfoName = previewCallableName ?? baseCodeInfoName;
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId: null,
  });
  const callableErrorMessages = useTypeErrors(
    (state) => state.errors[sectionId]?.callable,
  );
  const callableErrorMessage = callableErrorMessages?.join("\n") ?? "";
  const hasCallableError = callableErrorMessage.length > 0;
  const inputState = useSectionSearchInputState({
    codeInfoName,
    lspEnabled,
    onEnter,
    onShiftEnter,
    sectionId,
  });
  const valueNameInconsistentStyle = inputState.valueNameInconsistent
    ? "setta-callable-ready"
    : "";
  const callableErrorStyle =
    hasCallableError && !inputState.valueNameInconsistent
      ? "!bg-red-200 dark:!bg-red-800/30 !border-red-200 dark:!border-red-800/30"
      : "";
  const showStatusIndicator =
    inputState.valueNameInconsistent || waitingForResult;
  const showCallableErrorIndicator =
    hasCallableError && !inputState.valueNameInconsistent;
  function onCallableErrorContextMenu(e: MouseEvent<HTMLSpanElement>) {
    openTypeErrorContextMenu(e, sectionId, null);
  }
  const tooltipContentArray = buildSectionSearchTooltipContent(
    hasCallableError,
    callableErrorMessage,
    codeInfoName,
    description,
  );
  return (
    <search
      className="section-search single-cell-container relative w-full"
      {...getFloatingBoxHandlers(...tooltipContentArray)}
      ref={searchRef}
    >
      <TextInputCodeMirror
        dummyDivId={divId}
        sectionId={sectionId}
        paramInfoId={null}
        value={inputState.displayedCallableName}
        onBlur={inputState.onBlur}
        onChange={inputState.onChange}
        dummyCodeClassName={`${dummyCodeClassName} ${valueNameInconsistentStyle} ${callableErrorStyle}`}
        realCodeClassName={`${realCodeClassName} ${valueNameInconsistentStyle} ${callableErrorStyle}`}
        singleLine={true}
        keyComboActions={inputState.keyComboActions}
        onTab={inputState.onTab}
        onEscape={inputState.onEscape}
        language={configLanguage}
        isDisabled={isDisabled}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <SectionSearchRightIndicator
        onCallableErrorContextMenu={onCallableErrorContextMenu}
        showCallableErrorIndicator={showCallableErrorIndicator}
        showStatusIndicator={showStatusIndicator}
        valueNameInconsistent={inputState.valueNameInconsistent}
        waitingForResult={waitingForResult}
      />
    </search>
  );
}
async function setCallable(
  sectionId: string,
  callableName: string,
  canUseLsp: boolean,
  refetchParams = false,
) {
  if (!canUseLsp) {
    return;
  }
  const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);
  const projectConfigId = getCurrProjectConfigId();
  const payload = {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams,
  };
  const updated = await setCallableAndRefreshProjectState(payload);
  if (updated) {
    setToNotWaiting();
  }
}
