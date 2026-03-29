import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_text_field_completion } from "utils/generatedEndpoints";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getOnCreateEditor, wrappedCompletionsFn } from "./getOnCreateEditor";
import {
  buildTextInputCodeMirrorCoreView,
  getInitialTextInputCodeMirrorActivationEvent,
  planTextInputCodeMirrorMouseDown,
  shouldActivateTextInputCodeMirrorFromFocus,
  shouldAutoActivateTextInputCodeMirrorOnMount,
  shouldRenderTextInputCodeMirrorDummy,
  shouldTrackTextInputCodeMirrorInitializationInState,
} from "./textInputCodeMirrorView";
import { useCodeMirrorTooltipParent } from "./useCodeMirrorTooltipParent";

type TextInputCodeMirrorActivationEvent =
  | MouseEvent<HTMLElement>
  | "tab"
  | null;

export function TextInputCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onBlur,
  onMouseDown,
  dummyCodeClassName,
  realCodeClassName,
  singleLine,
  wrapLines,
  keyComboActions,
  onEscape,
  onTab,
  color,
  language,
  dummyDivId,
  tooltipParentDivId,
  autocomplete = true,
  isKeyName = false,
  isDisabled = false,
  shouldAutoActivateOnMount = false,
  completionsFn,
}) {
  const initialActivationEvent = getInitialTextInputCodeMirrorActivationEvent({
    isDisabled,
    shouldAutoActivateOnMount,
  });
  const [activationEvent, setActivationEvent] =
    useState<TextInputCodeMirrorActivationEvent>(initialActivationEvent);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const didAutoActivateOnMountRef = useRef(initialActivationEvent === "tab");
  const theme = useCodeMirrorStyle(color);
  const shouldTrackInitializationInState =
    shouldTrackTextInputCodeMirrorInitializationInState({
      shouldAutoActivateOnMount,
    });
  const shouldRenderDummy = shouldRenderTextInputCodeMirrorDummy({
    hasActivationEvent: activationEvent !== null,
    isRealEditorInitialized: realIsInitialized,
    shouldAutoActivateOnMount,
  });

  useEffect(() => {
    if (
      !shouldAutoActivateTextInputCodeMirrorOnMount({
        hasActivationEvent: activationEvent !== null,
        hasAutoActivatedOnMount: didAutoActivateOnMountRef.current,
        isDisabled,
        shouldAutoActivateOnMount,
      })
    ) {
      return;
    }

    didAutoActivateOnMountRef.current = true;
    setActivationEvent("tab");
  }, [activationEvent, isDisabled, shouldAutoActivateOnMount]);

  function localOnBlur() {
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 0);
    onBlur?.();
  }

  // Has to be onMouseDownCapture to avoid section outline flashing
  // when section is locked.
  function localOnMouseDownCapture(event: MouseEvent<HTMLElement>) {
    const mouseDownPlan = planTextInputCodeMirrorMouseDown({
      button: event.button,
      isDisabled,
    });

    if (mouseDownPlan.shouldActivate) {
      setActivationEvent(event);
    }
    if (mouseDownPlan.shouldApplyActiveSectionChange) {
      applyActiveSectionChange({ interaction: "input-focus", sectionId });
    }
    onMouseDown?.(event);
  }

  // focused via tab key
  function onFocus() {
    if (
      shouldActivateTextInputCodeMirrorFromFocus({
        hasActivationEvent: activationEvent !== null,
        isDisabled,
      })
    ) {
      setActivationEvent("tab");
    }
  }

  return (
    <>
      {shouldRenderDummy && (
        <DummyCodeMirror
          divId={dummyDivId}
          code={value}
          onMouseDownCapture={localOnMouseDownCapture}
          onFocus={onFocus}
          className={dummyCodeClassName}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          placeholder={defaultVal}
          language={language}
        />
      )}
      {activationEvent && (
        <CoreCodeMirror
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          className={realCodeClassName}
          singleLine={singleLine}
          wrapLines={wrapLines}
          keyComboActions={keyComboActions}
          onEscape={onEscape}
          onTab={onTab}
          onBlur={localOnBlur}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          shouldTrackInitializationInState={shouldTrackInitializationInState}
          theme={theme}
          language={language}
          autocomplete={autocomplete}
          isKeyName={isKeyName}
          tooltipParentDivId={tooltipParentDivId}
          completionsFn={completionsFn}
        />
      )}
    </>
  );
}

function CoreCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  className,
  singleLine,
  wrapLines,
  keyComboActions,
  onEscape,
  onBlur,
  onTab,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  shouldTrackInitializationInState,
  theme,
  language,
  autocomplete,
  isKeyName,
  completionsFn,
  tooltipParentDivId,
}) {
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const didImperativelyRevealEditorRef = useRef(false);
  const coreView = buildTextInputCodeMirrorCoreView({
    sectionId,
    paramInfoId,
    isKeyName,
    isDeploymentMode,
    autocomplete,
    language,
    tooltipParentDivId,
  });
  const tooltipParent = useCodeMirrorTooltipParent(
    coreView.resolvedTooltipParentDivId,
  );

  const resolvedCompletionsFn = useCallback(
    coreView.shouldAutocomplete
      ? completionsFn ?? getTextFieldCompletionsFn(sectionId, paramInfoId)
      : () => null,
    [sectionId, paramInfoId, coreView.shouldAutocomplete, completionsFn],
  );
  const shouldHideEditor = shouldTrackInitializationInState
    ? !realIsInitialized
    : !didImperativelyRevealEditorRef.current;

  const extensions = getExtensions({
    parent: tooltipParent,
    language,
    completionsFn: resolvedCompletionsFn,
    singleLine,
    wrapLines,
    tabToAutocomplete: true,
    keyComboActions,
    onTab,
    onEscape,
  });

  const onCreateEditor = getOnCreateEditor({
    initialEvent,
    onEditorReady: () => {
      if (shouldTrackInitializationInState) {
        setRealIsInitialized(true);
        return;
      }

      didImperativelyRevealEditorRef.current = true;
      document.getElementById(coreView.divId)?.classList.remove("opacity-0");
    },
    divId: coreView.divId,
    value,
    defaultVal,
  });

  return (
    <CodeMirror
      id={coreView.divId}
      className={`${className} ${shouldHideEditor ? "opacity-0" : ""}`.trim()}
      value={value}
      placeholder={defaultVal}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        tabSize: 4,
      }}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      onBlur={onBlur}
      indentWithTab={false} // I take care of this in getExtensions
      tabIndex={0} // keep focusable for tab navigation
    />
  );
}

function getTextFieldCompletionsFn(
  sectionId: string,
  paramInfoId: string | null,
) {
  const fn = async (fullText: string, position: number) => {
    const setToNotWaiting = setTextFieldWaitingForLSP({
      sectionId,
      paramInfoId,
    });

    const projectConfigId = getCurrProjectConfigId();

    const res = await route_text_field_completion({
      projectConfigId,
      sectionId,
      paramInfoId,
      fullText,
      position,
    });

    setToNotWaiting();
    if (res200(res)) {
      return res.data;
    }
    return [];
  };

  return wrappedCompletionsFn(fn);
}
