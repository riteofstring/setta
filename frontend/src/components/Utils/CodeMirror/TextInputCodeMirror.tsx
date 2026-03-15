import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_text_field_completion } from "utils/generatedEndpoints";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getOnCreateEditor, wrappedCompletionsFn } from "./getOnCreateEditor";
import { useCodeMirrorTooltipParent } from "./useCodeMirrorTooltipParent";

const TEXT_INPUT_SECTION_GUARD_CLASS_NAME = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`;
const TEXT_FIELD_COMPLETIONS_FN_CACHE = new Map<string, ReturnType<typeof wrappedCompletionsFn>>();
const TEXT_INPUT_BASIC_SETUP = {
  lineNumbers: false,
  highlightActiveLineGutter: false,
  highlightSpecialChars: false,
  history: false,
  foldGutter: false,
  dropCursor: false,
  allowMultipleSelections: false,
  indentOnInput: false,
  autocompletion: false,
  rectangularSelection: false,
  crosshairCursor: false,
  highlightActiveLine: false,
  highlightSelectionMatches: false,
  historyKeymap: false,
  foldKeymap: false,
  completionKeymap: false,
  lintKeymap: false,
  tabSize: 4,
} as const;

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
  completionsFn,
}) {
  const [activationEvent, setActivationEvent] = useState(null);
  const theme = useCodeMirrorStyle(color);

  function localOnBlur() {
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
      flushSync(() => {
        setActivationEvent(event);
      });
      applyActiveSectionChange({ interaction: "input-focus", sectionId });
    }
    onMouseDown?.(event);
  }

  // focused via tab key
  function onFocus() {
    if (isDisabled) {
      return;
    }
    if (!activationEvent) {
      flushSync(() => {
        setActivationEvent("tab");
      });
    }
  }

  return (
    <>
      {!activationEvent && (
        <DummyCodeMirror
          divId={dummyDivId}
          code={value}
          onMouseDownCapture={localOnMouseDownCapture}
          onFocus={onFocus}
          className={`${TEXT_INPUT_SECTION_GUARD_CLASS_NAME} ${dummyCodeClassName}`}
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

export function resolveTooltipParentDivId(
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
  onEscape,
  onBlur,
  onTab,
  initialEvent,
  theme,
  language,
  autocomplete,
  isKeyName,
  completionsFn,
  tooltipParentDivId,
}) {
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const canUseLsp = !isDeploymentMode;
  const shouldAutocomplete = canUseLsp && autocomplete && language === "python";
  const divId = `CodeMirror-${sectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;
  const onCreateEditor = useMemo(
    () =>
      getOnCreateEditor({
        initialEvent,
        value,
        defaultVal,
      }),
    [defaultVal, initialEvent, value],
  );

  if (shouldAutocomplete) {
    return (
      <AutocompleteCoreCodeMirror
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        defaultVal={defaultVal}
        onChange={onChange}
        className={className}
        singleLine={singleLine}
        wrapLines={wrapLines}
        keyComboActions={keyComboActions}
        onEscape={onEscape}
        onBlur={onBlur}
        onTab={onTab}
        onCreateEditor={onCreateEditor}
        theme={theme}
        language={language}
        completionsFn={completionsFn}
        tooltipParentDivId={tooltipParentDivId}
        divId={divId}
      />
    );
  }

  return (
    <PlainCoreCodeMirror
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      className={className}
      singleLine={singleLine}
      wrapLines={wrapLines}
      keyComboActions={keyComboActions}
      onEscape={onEscape}
      onBlur={onBlur}
      onTab={onTab}
      onCreateEditor={onCreateEditor}
      theme={theme}
      language={language}
      divId={divId}
    />
  );
}

function PlainCoreCodeMirror({
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
  onCreateEditor,
  theme,
  language,
  divId,
}) {
  const extensions = useMemo(
    () =>
      getExtensions({
        language,
        singleLine,
        wrapLines,
        tabToAutocomplete: true,
        keyComboActions,
        onTab,
        onEscape,
      }),
    [
      keyComboActions,
      language,
      onEscape,
      onTab,
      singleLine,
      wrapLines,
    ],
  );

  return (
    <RenderedCodeMirror
      divId={divId}
      className={className}
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      onBlur={onBlur}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
    />
  );
}

function AutocompleteCoreCodeMirror({
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
  onCreateEditor,
  theme,
  language,
  completionsFn,
  tooltipParentDivId,
  divId,
}) {
  const resolvedTooltipParentDivId =
    resolveTooltipParentDivId(tooltipParentDivId);
  const tooltipParent = useCodeMirrorTooltipParent(resolvedTooltipParentDivId);
  const resolvedCompletionsFn = useMemo(
    () => completionsFn ?? getTextFieldCompletionsFn(sectionId, paramInfoId),
    [completionsFn, paramInfoId, sectionId],
  );

  const extensions = useMemo(
    () =>
      getExtensions({
        parent: tooltipParent,
        language,
        completionsFn: resolvedCompletionsFn,
        singleLine,
        wrapLines,
        tabToAutocomplete: true,
        keyComboActions,
        onTab,
        onEscape,
      }),
    [
      keyComboActions,
      language,
      onEscape,
      onTab,
      resolvedCompletionsFn,
      singleLine,
      tooltipParent,
      wrapLines,
    ],
  );

  return (
    <RenderedCodeMirror
      divId={divId}
      className={className}
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      onBlur={onBlur}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
    />
  );
}

function RenderedCodeMirror({
  divId,
  className,
  value,
  defaultVal,
  onChange,
  onBlur,
  onCreateEditor,
  theme,
  extensions,
}) {
  return (
    <CodeMirror
      id={divId}
      className={`${TEXT_INPUT_SECTION_GUARD_CLASS_NAME} ${className}`}
      value={value}
      placeholder={defaultVal}
      basicSetup={TEXT_INPUT_BASIC_SETUP}
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
  const cacheKey = `${sectionId}:${paramInfoId ?? ""}`;
  const cached = TEXT_FIELD_COMPLETIONS_FN_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

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

  const wrapped = wrappedCompletionsFn(fn);
  TEXT_FIELD_COMPLETIONS_FN_CACHE.set(cacheKey, wrapped);
  return wrapped;
}
