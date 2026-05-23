import type { Completion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { textFieldCompletion } from "openapi/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  nowChromeReproPerformanceMs,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getOnCreateEditor, wrappedCompletionsFn } from "./getOnCreateEditor";
import { useCodeMirrorTooltipParent } from "./useCodeMirrorTooltipParent";

export type TextInputCodeMirrorInitialActivationEvent =
  | "tab"
  | { readonly clientX: number; readonly clientY: number };

export function TextInputCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onActivity,
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
  focusActiveSectionOnMouseDown = true,
  isKeyName = false,
  isDisabled = false,
  completionsFn,
  initialActivationEvent,
}) {
  const {
    activationEvent,
    realIsInitialized,
    setActivationEvent,
    setRealIsInitialized,
  } = useTextInputCodeMirrorActivationState({
    initialActivationEvent,
    isDisabled,
  });
  const theme = useCodeMirrorStyle(color);
  const gpuFlowControl = getTextInputCodeMirrorGpuFlowControl({
    isKeyName,
    paramInfoId,
    sectionId,
  });
  function localOnBlur() {
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      if (!initialActivationEvent) {
        setActivationEvent(null);
        setRealIsInitialized(false);
      }
    }, 0);
    postTextInputCodeMirrorActivationChromeReproEvent({
      defaultValueLength: (defaultVal ?? "").length,
      gpuFlowControl,
      isKeyName,
      language,
      paramInfoId,
      phase: "blur",
      realIsInitialized,
      sectionId,
      valueLength: (value ?? "").length,
    });
    onBlur?.();
  }
  // Has to be onMouseDownCapture to avoid section outline flashing
  // when section is locked.
  function localOnMouseDownCapture(event) {
    if (isDisabled) {
      onMouseDown?.(event);
      return;
    }
    if (event.button === 0) {
      postTextInputCodeMirrorActivationChromeReproEvent({
        defaultValueLength: (defaultVal ?? "").length,
        event: summarizeCodeMirrorActivationMouseEvent(event),
        gpuFlowControl,
        isKeyName,
        language,
        paramInfoId,
        phase: "request",
        realIsInitialized,
        sectionId,
        valueLength: (value ?? "").length,
      });
      setActivationEvent(event);
      if (focusActiveSectionOnMouseDown) {
        applyActiveSectionChange({ interaction: "input-focus", sectionId });
      }
    }
    onMouseDown?.(event);
  }
  // focused via tab key
  function onFocus() {
    if (isDisabled) {
      return;
    }
    if (!activationEvent) {
      postTextInputCodeMirrorActivationChromeReproEvent({
        defaultValueLength: (defaultVal ?? "").length,
        gpuFlowControl,
        isKeyName,
        language,
        paramInfoId,
        phase: "tab-focus-request",
        realIsInitialized,
        sectionId,
        valueLength: (value ?? "").length,
      });
      setActivationEvent("tab");
    }
  }
  return (
    <>
      {!realIsInitialized && (
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
          gpuFlowControl={gpuFlowControl}
        />
      )}
      {activationEvent && (
        <CoreCodeMirror
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          onActivity={onActivity}
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
          theme={theme}
          language={language}
          autocomplete={autocomplete}
          isKeyName={isKeyName}
          tooltipParentDivId={tooltipParentDivId}
          completionsFn={completionsFn}
          gpuFlowControl={gpuFlowControl}
        />
      )}
    </>
  );
}

function useTextInputCodeMirrorActivationState({
  initialActivationEvent,
  isDisabled,
}: {
  readonly initialActivationEvent:
    | TextInputCodeMirrorInitialActivationEvent
    | null
    | undefined;
  readonly isDisabled: boolean;
}) {
  const initialActivationKey =
    getEnabledTextInputCodeMirrorInitialActivationKey({
      event: initialActivationEvent,
      isDisabled,
    });
  const [activationEvent, setActivationEvent] =
    useState<TextInputCodeMirrorInitialActivationEvent | null>(() =>
      initialActivationKey ? initialActivationEvent : null,
    );
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const consumedInitialActivationKeyRef = useRef<string | null>(
    initialActivationKey,
  );
  const initialActivationClientX =
    getTextInputCodeMirrorInitialActivationCoordinate(
      initialActivationEvent,
      "clientX",
    );
  const initialActivationClientY =
    getTextInputCodeMirrorInitialActivationCoordinate(
      initialActivationEvent,
      "clientY",
    );

  useEffect(() => {
    const activationKey = getEnabledTextInputCodeMirrorInitialActivationKey({
      event: initialActivationEvent,
      isDisabled,
    });
    if (!activationKey) {
      return;
    }
    if (consumedInitialActivationKeyRef.current === activationKey) {
      return;
    }
    consumedInitialActivationKeyRef.current = activationKey;
    setActivationEvent(initialActivationEvent ?? null);
  }, [
    initialActivationClientX,
    initialActivationClientY,
    initialActivationEvent,
    isDisabled,
  ]);

  return {
    activationEvent,
    realIsInitialized,
    setActivationEvent,
    setRealIsInitialized,
  };
}

function getEnabledTextInputCodeMirrorInitialActivationKey({
  event,
  isDisabled,
}: {
  readonly event: TextInputCodeMirrorInitialActivationEvent | null | undefined;
  readonly isDisabled: boolean;
}): string | null {
  if (isDisabled || !event) {
    return null;
  }
  return getTextInputCodeMirrorInitialActivationKey(event);
}

function getTextInputCodeMirrorInitialActivationKey(
  event: TextInputCodeMirrorInitialActivationEvent,
): string {
  if (event === "tab") {
    return "tab";
  }
  return `pointer:${event.clientX}:${event.clientY}`;
}

function getTextInputCodeMirrorInitialActivationCoordinate(
  event: TextInputCodeMirrorInitialActivationEvent | null | undefined,
  coordinate: "clientX" | "clientY",
): number | null {
  if (!event || event === "tab") {
    return null;
  }
  return event[coordinate];
}

function postTextInputCodeMirrorActivationChromeReproEvent({
  defaultValueLength,
  event,
  gpuFlowControl,
  isKeyName,
  language,
  paramInfoId,
  phase,
  realIsInitialized,
  sectionId,
  valueLength,
}: {
  readonly defaultValueLength: number;
  readonly event?:
    | {
        readonly button: number;
        readonly clientX: number;
        readonly clientY: number;
        readonly type: string;
      }
    | undefined;
  readonly gpuFlowControl: string;
  readonly isKeyName: boolean;
  readonly language: string | null | undefined;
  readonly paramInfoId: string | null | undefined;
  readonly phase: string;
  readonly realIsInitialized: boolean;
  readonly sectionId: string;
  readonly valueLength: number;
}) {
  postChromeReproEvent("gpu-flow-codemirror-activation", {
    defaultValueLength,
    event: event ?? null,
    gpuFlowControl,
    isKeyName,
    language: language ?? "plain",
    paramInfoId: paramInfoId ?? "",
    performanceMs: roundChromeReproMs(nowChromeReproPerformanceMs()),
    phase,
    realIsInitialized,
    sectionId,
    valueLength,
  });
}

function summarizeCodeMirrorActivationMouseEvent(event: {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly type: string;
}) {
  return {
    button: event.button,
    clientX: roundChromeReproMs(event.clientX),
    clientY: roundChromeReproMs(event.clientY),
    type: event.type,
  };
}

function getTextInputCodeMirrorGpuFlowControl({
  isKeyName,
  paramInfoId,
  sectionId,
}: {
  isKeyName: boolean;
  paramInfoId: string | null | undefined;
  sectionId: string;
}) {
  return `codemirror:${sectionId}:${paramInfoId ?? ""}${isKeyName ? ":key" : ":value"}`;
}

function resolveTooltipParentDivId(
  tooltipParentDivId: string | null | undefined,
): string | null {
  if (tooltipParentDivId === undefined) {
    return null;
  }
  return tooltipParentDivId;
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
  onActivity,
  onEscape,
  onBlur,
  onTab,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  theme,
  language,
  autocomplete,
  isKeyName,
  completionsFn,
  tooltipParentDivId,
  gpuFlowControl,
}) {
  const divId = `CodeMirror-${sectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const canUseLsp = !isDeploymentMode;
  const shouldAutocomplete = canUseLsp && autocomplete && language === "python";
  const resolvedTooltipParentDivId =
    resolveTooltipParentDivId(tooltipParentDivId);
  const tooltipParent = useCodeMirrorTooltipParent(resolvedTooltipParentDivId);
  const resolvedCompletionsFn = useCallback(
    shouldAutocomplete
      ? completionsFn ?? getTextFieldCompletionsFn(sectionId, paramInfoId)
      : () => null,
    [sectionId, paramInfoId, shouldAutocomplete, completionsFn],
  );
  const extensions = getExtensions({
    parent: tooltipParent,
    language,
    completionsFn: resolvedCompletionsFn,
    singleLine,
    wrapLines,
    tabToAutocomplete: true,
    keyComboActions,
    onActivity,
    onTab,
    onEscape,
  });
  const accessibleName = isKeyName ? "Parameter name" : "Parameter value";
  const onCreateEditor = getOnCreateEditor({
    initialEvent,
    setRealIsInitialized,
    divId,
    value,
    defaultVal,
  });
  return (
    <CodeMirror
      id={divId}
      data-gpu-flow-activation="mousedown"
      data-gpu-flow-control={gpuFlowControl}
      data-gpu-flow-interactive="true"
      className={`${className} ${!realIsInitialized ? "opacity-0" : ""}`}
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
      extensions={[
        ...extensions,
        EditorView.contentAttributes.of({ "aria-label": accessibleName }),
      ]}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDownCapture={onActivity}
      indentWithTab={false} // I take care of this in getExtensions
      tabIndex={0} // keep focusable for tab navigation
    />
  );
}
function getTextFieldCompletionsFn(
  sectionId: string,
  paramInfoId: string | null,
) {
  const fn = async (
    fullText: string,
    position: number,
  ): Promise<Completion[]> => {
    const setToNotWaiting = setTextFieldWaitingForLSP({
      sectionId,
      paramInfoId,
    });
    const projectConfigId = getCurrProjectConfigId();
    const request = textFieldCompletion({
      body: {
        projectConfigId,
        sectionId,
        paramInfoId,
        fullText,
        position,
      },
    } as Parameters<typeof textFieldCompletion>[0]);
    const res = await callOpenAPI(request as Parameters<typeof callOpenAPI>[0]);
    setToNotWaiting();
    if (res200(res)) {
      return (res.data ?? []) as Completion[];
    }
    return [];
  };
  return wrappedCompletionsFn(fn);
}
