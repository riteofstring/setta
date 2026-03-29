import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import { scheduleEdgeHandlePositionUpdate } from "state/actions/edgeHandles";
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
import { route_clear_text_field_completion } from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

export function SectionSearch({
  sectionId,
  callable,
}: {
  sectionId: string;
  callable: string | null;
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
    />
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
}) {
  const searchRef = useRef<HTMLElement | null>(null);
  const heightKey = getSectionSearchHeightKey(sectionId);

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
      scheduleEdgeHandlePositionUpdate([sectionId]);
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
        scheduleEdgeHandlePositionUpdate([sectionId]);
      }
    };
  }, [heightKey, sectionId]);

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

  const [valueNameInconsistent, setValueNameInconsistent] = useState(false);
  const [draftCallableName, setDraftCallableName] = useState<string | null>(
    null,
  );
  const shouldResetValueOnBlur = useRef(false);
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId: null,
  });
  const callableErrorMessages = useTypeErrors(
    (state) => state.errors[sectionId]?.callable,
  );
  const callableErrorMessage = callableErrorMessages?.join("\n") ?? "";
  const hasCallableError = callableErrorMessage.length > 0;

  const debouncedSetValueNameInconsistent = useCallback(
    _.debounce((isInconsistent: boolean) => {
      setValueNameInconsistent(isInconsistent);
    }, 1000),
    [setValueNameInconsistent],
  );

  function setValueAndCheckConsistency(value: string, cancelDebounced = false) {
    if (cancelDebounced) {
      debouncedSetValueNameInconsistent.cancel();
      setValueNameInconsistent(false);
    } else {
      debouncedSetValueNameInconsistent(value !== codeInfoName);
    }
  }

  useEffect(() => {
    setValueAndCheckConsistency(codeInfoName, true);
    setDraftCallableName((prev) => (prev !== null ? null : prev));
  }, [codeInfoName]);

  function onBlur() {
    if (shouldResetValueOnBlur.current) {
      setDraftCallableName(null);
      setValueAndCheckConsistency(codeInfoName, true);
      const projectConfigId = getCurrProjectConfigId();
      if (lspEnabled) {
        route_clear_text_field_completion({
          projectConfigId,
          sectionId,
          paramInfoId: null,
        });
      }
      shouldResetValueOnBlur.current = false;
      return;
    }
    shouldResetValueOnBlur.current = false;
  }

  function onEscape(completionResult: boolean) {
    if (!completionResult) {
      setDraftCallableName(null);
      setValueAndCheckConsistency(codeInfoName, true);
      shouldResetValueOnBlur.current = true;
      // TODO: Re-enable focusOnSection(null, sectionId, false) once tabbing logic is restored.
    }
  }

  function onTab(value: string, completionResult: boolean) {
    if (!completionResult && value) {
      shouldResetValueOnBlur.current = false;
      clearApplyIndicator();
      onEnter(value);
    }
  }

  function onChange(value: string) {
    setDraftCallableName(value);
    setValueAndCheckConsistency(value);
  }

  function clearApplyIndicator() {
    debouncedSetValueNameInconsistent.cancel();
    setValueNameInconsistent(false);
  }

  const keyComboActions = {
    Enter: (value: string) => {
      clearApplyIndicator();
      onEnter(value);
    },
    "Alt-Enter": (value: string) => {
      clearApplyIndicator();
      onShiftEnter(value);
    },
  };

  // TODO: Shouldn't use important for this, but ok for now. FIX.
  const valueNameInconsistentStyle = valueNameInconsistent
    ? "setta-callable-ready"
    : "";
  let callableErrorStyle = "";
  if (hasCallableError && !valueNameInconsistent) {
    callableErrorStyle =
      "!bg-red-200 dark:!bg-red-800/30 !border-red-200 dark:!border-red-800/30";
  }
  const showStatusIndicator = valueNameInconsistent || waitingForResult;
  const showCallableErrorIndicator = hasCallableError && !valueNameInconsistent;
  const showRightIndicator = showStatusIndicator || showCallableErrorIndicator;

  function onCallableErrorContextMenu(e: MouseEvent<HTMLSpanElement>) {
    openTypeErrorContextMenu(e, sectionId, null);
  }

  const displayedCallableName =
    draftCallableName !== null ? draftCallableName : codeInfoName;
  const tooltipContentArray = hasCallableError
    ? [
        {
          content: callableErrorMessage,
          wrapperClassName:
            "!border-red-300 dark:!border-red-900 [&_.tooltip-footer]:!text-red-500 dark:[&_.tooltip-footer]:!text-red-800 dark:[&_.tooltip-footer]:!border-red-950 !bg-red-50/90 dark:!bg-[#120000]/90 [&_.tooltip-copy]:!text-red-400 dark:[&_.tooltip-copy]:!text-red-300 [&>.tooltip-copy]:hover:!bg-transparent",
          contentClassName: "!text-red-700 dark:!text-red-300 font-mono",
        },
        { title: codeInfoName, content: description },
      ]
    : [{ title: codeInfoName, content: description }];

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
        value={displayedCallableName}
        onBlur={onBlur}
        onChange={onChange}
        dummyCodeClassName={`${dummyCodeClassName} ${valueNameInconsistentStyle} ${callableErrorStyle}`}
        realCodeClassName={`${realCodeClassName} ${valueNameInconsistentStyle} ${callableErrorStyle}`}
        singleLine={true}
        keyComboActions={keyComboActions}
        onTab={onTab}
        onEscape={onEscape}
        language={configLanguage}
        isDisabled={isDisabled}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      {showRightIndicator && (
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
      )}
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
