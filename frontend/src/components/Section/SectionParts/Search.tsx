import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { setParametersRequestWaitingForLSP } from "state/actions/lsp";
import {
  dispatchOptimisticProjectStateUpdate,
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
import { focusOnSection } from "utils/tabbingLogic";

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
  const shouldResetValueOnBlur = useRef(false);

  const debouncedSetValueNameInconsistent = useCallback(
    _.debounce((x) => {
      setValueNameInconsistent(x);
    }, 1000),
    [setValueNameInconsistent],
  );

  function setValueAndCheckConsistency(value, cancelDebounced = false) {
    if (cancelDebounced) {
      debouncedSetValueNameInconsistent.cancel();
      setValueNameInconsistent(false);
    } else {
      debouncedSetValueNameInconsistent(value !== codeInfoName);
    }
  }

  useEffect(() => {
    setValueAndCheckConsistency(codeInfoName, true);
  }, [codeInfoName]);

  function onBlur() {
    if (shouldResetValueOnBlur.current) {
      setValueAndCheckConsistency(codeInfoName, true);
      const projectConfigId = getCurrProjectConfigId();
      route_clear_text_field_completion({
        projectConfigId,
        sectionId,
        paramInfoId: null,
      });
    }
    shouldResetValueOnBlur.current = false;
  }

  function onEscape(completionResult) {
    if (!completionResult) {
      shouldResetValueOnBlur.current = true;
      focusOnSection(null, sectionId, false);
    }
  }

  function onTab(value, completionResult) {
    if (!completionResult && value) {
      shouldResetValueOnBlur.current = false;
      onEnter(value);
    }
  }

  function onChange(value) {
    setValueAndCheckConsistency(value);
  }

  function _onEnter(value) {
    onEnter(value);
  }

  function _onShiftEnter(value) {
    onShiftEnter(value);
  }

  const keyComboActions = {
    Enter: _onEnter,
    "Alt-Enter": _onShiftEnter,
  };

  // TODO: Shouldn't use important for this, but ok for now. FIX.
  const valueNameInconsistentStyle = valueNameInconsistent
    ? "!border-amber-500 dark:!border-amber-800"
    : "";

  return (
    <search
      className="section-search single-cell-container w-full"
      {...getFloatingBoxHandlers({ title: codeInfoName, content: description })}
    >
      <TextInputCodeMirror
        dummyDivId={divId}
        sectionId={sectionId}
        paramInfoId={null}
        value={codeInfoName}
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
      <LoadingSpinner sectionId={sectionId} />
    </search>
  );
}

function LoadingSpinner({ sectionId }) {
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId: null,
  });
  // const waitingForResult = true;
  return (
    waitingForResult && (
      <i className="single-cell-child gg-spinner mr-2 self-center justify-self-end text-blue-500/70" />
    )
  );
}

export function setCallable(
  sectionId: string,
  callableName: string,
  refetchParams = false,
) {
  const setToNotWaiting = setParametersRequestWaitingForLSP(sectionId);
  dispatchOptimisticProjectStateUpdate({
    apply: () => {
      // Skip optimistic update
    },
    send: async (frontendOpId) => {
      const projectConfigId = getCurrProjectConfigId();
      const res = await route_set_callable({
        projectConfigId,
        sectionId,
        callableName,
        refetchParams,
        frontendOpId,
      });
      if (res200(res)) {
        // state update occurs by websocket
        setToNotWaiting();
      }
    },
  });
}
