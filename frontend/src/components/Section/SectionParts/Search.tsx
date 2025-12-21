import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { setParametersRequestWaitingForLSP } from "state/actions/lsp";
import {
  getCodeObjCore,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useSectionImplIsFrozen } from "state/hooks/sectionVariants";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_clear_text_field_completion,
  route_set_callable,
} from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

export function SectionSearch({
  sectionId,
  callable,
}: {
  sectionId: string;
  callable: string | null;
}) {
  const variantIsFrozen = useSectionImplIsFrozen(sectionId);

  function onEnter(value: string) {
    setCallable(sectionId, value);
  }

  function onShiftEnter(value: string) {
    setCallable(sectionId, value, true);
  }

  return (
    <SectionSearchCore
      divId={`${sectionId}-search`}
      sectionId={sectionId}
      callable={callable}
      onEnter={onEnter}
      onShiftEnter={onShiftEnter}
      dummyCodeClassName={`${NO_PAN_CLASS_NAME} single-cell-child rounded-2xl border border-solid border-setta-100 bg-white py-1 dark:border-setta-800 dark:bg-setta-950 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]`}
      realCodeClassName={`${NO_PAN_CLASS_NAME} single-cell-child nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid border-blue-500 bg-white mx-[.125rem] py-1  dark:border-blue-400/50 dark:bg-setta-950 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit`}
      isDisabled={variantIsFrozen}
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
}: {
  sectionId: string;
  callable: string | null;
  onEnter: (x: string) => void;
  onShiftEnter: (x: string) => void;
  dummyCodeClassName: string;
  realCodeClassName: string;
  isDisabled: boolean;
  divId: string;
}) {
  const {
    name: codeInfoName,
    description,
    configLanguage,
  } = useProjectState((x) => {
    const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const { configLanguage } = sectionImpl;
    if (callable) {
      const codeObj = getCodeObjCore(x, callable);
      const impl = getCurrEffectiveCodeObjImpl(x, sectionId, callable);
      const { description } = impl;
      return { name: codeObj.name, description, configLanguage };
    }
    return { name: "", description: "", configLanguage };
  }, _.isEqual);

  const [valueNameInconsistent, setValueNameInconsistent] = useState(false);
  const [draftCallableName, setDraftCallableName] = useState<string | null>(
    null,
  );
  const shouldResetValueOnBlur = useRef(false);
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId: null,
  });

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
      route_clear_text_field_completion({
        projectConfigId,
        sectionId,
        paramInfoId: null,
      });
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
  const showRightIndicator = valueNameInconsistent || waitingForResult;

  const displayedCallableName =
    draftCallableName !== null ? draftCallableName : codeInfoName;

  return (
    <search
      className="section-search single-cell-container relative w-full"
      {...getFloatingBoxHandlers({ title: codeInfoName, content: description })}
    >
      <TextInputCodeMirror
        dummyDivId={divId}
        sectionId={sectionId}
        paramInfoId={null}
        value={displayedCallableName}
        onBlur={onBlur}
        onChange={onChange}
        dummyCodeClassName={`${dummyCodeClassName} ${valueNameInconsistentStyle}`}
        realCodeClassName={`${realCodeClassName} ${valueNameInconsistentStyle}`}
        singleLine={true}
        keyComboActions={keyComboActions}
        onTab={onTab}
        onEscape={onEscape}
        language={configLanguage}
        isDisabled={isDisabled}
      />
      {showRightIndicator && (
        <div className="single-cell-child pointer-events-none mr-2 flex items-center self-center justify-self-end">
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
        </div>
      )}
    </search>
  );
}

async function setCallable(
  sectionId: string,
  callableName: string,
  refetchParams = false,
) {
  const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);
  const projectConfigId = getCurrProjectConfigId();
  const res = await route_set_callable({
    projectConfigId,
    sectionId,
    callableName,
    refetchParams,
  });
  if (res200(res)) {
    // state update occurs by websocket
    setToNotWaiting();
  }
}
