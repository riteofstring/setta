import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { focusSectionAfterEscape } from "../sectionFocus";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getOnCreateEditor, type TextValueActivationEvent } from "./onCreateEditor";
import { getTextValueExtensions, TEXT_VALUE_BASIC_SETUP } from "./textValueExtensions";
import type { TextValueLanguage } from "./textValueLanguages";
import {
  mountTextValueThemeStyles,
  useTextValueTheme,
  type TextValueTheme,
} from "./textValueTheme";

// The item-controls milestone's text value editor: the reference's two-layer
// `TextInputCodeMirror` at the `ParamUI` text presentation, behind the package's controlled
// string seam. The idle layer is the highlighted dummy; a primary mouse-down capture or a
// keyboard focus swaps in the live CodeMirror editor, every document change reports once
// through the change callback, and Escape returns focus to the owning section. Backend editor
// services (completion, diagnostics, the waiting spinner) and the reference's error-message
// plumbing stay application-side. The control disables from the host flag and, package-wide,
// while item-select mode is active — the reference's interaction-first disabled contract with
// no blanket opacity treatment.

export type TextValueEditorProps = {
  ariaLabel: string;
  sectionId: string;
  itemId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  placeholder?: string;
  language?: TextValueLanguage | null;
  singleLine?: boolean;
  wrapLines?: boolean;
  disabled?: boolean;
};

type TextValueEditorCoreProps = Omit<TextValueEditorProps, "itemId"> & {
  controlId: string;
  presentation: "item-row" | "meta-control";
  metaMinimumHeight?: boolean;
};

// The reference `ParamUI` class strings for the text control, minus its backend error branch.
function getItemRowDummyClassName(isDisabled: boolean) {
  return `${NO_PAN_CLASS_NAME} section-value self-end peer/textinput ${NO_DRAG_CLASS_NAME} ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`;
}

const ITEM_ROW_REAL_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`;
const META_CONTROL_WRAPPER_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-container h-full min-h-0 w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 text-[11px] font-mono text-setta-700 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200`;

function getMetaControlDummyClassName(isDisabled: boolean) {
  return `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] ${!isDisabled ? "cursor-text select-text" : ""}`;
}

const META_CONTROL_REAL_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] cursor-text select-text [&_*]:!outline-0 [&_.cm-content]:!px-0 [&_.cm-content]:!py-0 [&_.cm-line]:!px-0`;

// The value-column divider with its `peer-focus-within` focus treatment; item-select mode
// suppresses the blue focus paint exactly as the reference's param-select mode does.
function getDividerClassName(isSelectingItems: boolean) {
  return `section-value self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingItems ? "peer-focus-within/textinput:border-blue-400" : ""}`;
}

type TextValuePresentationConfig = {
  dummyClassName: string;
  realClassName: string;
  dummyIdSuffix: string;
  showDivider: boolean;
  wrapperClassName: string | null;
};

function getTextValuePresentationConfig(
  presentation: TextValueEditorCoreProps["presentation"],
  isDisabled: boolean,
  metaMinimumHeight: boolean,
): TextValuePresentationConfig {
  if (presentation === "meta-control") {
    const minimumHeightClassName = metaMinimumHeight ? " min-h-24" : "";
    return {
      dummyClassName: `${getMetaControlDummyClassName(isDisabled)}${minimumHeightClassName}`,
      realClassName: `${META_CONTROL_REAL_CLASS_NAME}${minimumHeightClassName}`,
      dummyIdSuffix: "MetaControl",
      showDivider: false,
      wrapperClassName: META_CONTROL_WRAPPER_CLASS_NAME,
    };
  }
  return {
    dummyClassName: getItemRowDummyClassName(isDisabled),
    realClassName: ITEM_ROW_REAL_CLASS_NAME,
    dummyIdSuffix: "ItemValueInput",
    showDivider: true,
    wrapperClassName: null,
  };
}

function renderTextValueDivider(
  config: TextValuePresentationConfig,
  isSelectingItems: boolean,
): ReactNode {
  if (!config.showDivider) {
    return null;
  }
  return <span className={getDividerClassName(isSelectingItems)} />;
}

function wrapTextValueEditorLayers(
  config: TextValuePresentationConfig,
  editorLayers: ReactNode,
): ReactNode {
  if (!config.wrapperClassName) {
    return editorLayers;
  }
  return <div className={config.wrapperClassName}>{editorLayers}</div>;
}

export function TextValueEditor({ itemId, ...props }: TextValueEditorProps) {
  return <TextValueEditorCore {...props} controlId={itemId} presentation="item-row" />;
}

// Package-internal composition seam for the direct-on-canvas text control. The public item-row
// control keeps its established item vocabulary; MetaControl supplies its own control identity
// without duplicating the two-layer CodeMirror lifecycle.
export function MetaTextValueEditor({
  ariaLabel,
  sectionId,
  controlId,
  value,
  onValueChange,
  placeholder,
  language = null,
  singleLine = false,
  wrapLines,
  disabled = false,
  metaMinimumHeight = false,
}: Omit<TextValueEditorCoreProps, "presentation">) {
  return (
    <TextValueEditorCore
      ariaLabel={ariaLabel}
      sectionId={sectionId}
      controlId={controlId}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      language={language}
      singleLine={singleLine}
      wrapLines={wrapLines}
      disabled={disabled}
      metaMinimumHeight={metaMinimumHeight}
      presentation="meta-control"
    />
  );
}

function TextValueEditorCore({
  ariaLabel,
  sectionId,
  controlId,
  value,
  onValueChange,
  placeholder,
  language = null,
  singleLine = false,
  wrapLines,
  disabled = false,
  presentation,
  metaMinimumHeight = false,
}: TextValueEditorCoreProps) {
  const [activationEvent, setActivationEvent] = useState<TextValueActivationEvent | null>(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const isDisabled = disabled || isSelectingItems;
  const theme = useTextValueTheme();
  const presentationConfig = getTextValuePresentationConfig(
    presentation,
    isDisabled,
    metaMinimumHeight,
  );

  useEffect(() => {
    mountTextValueThemeStyles();
  }, []);

  function localOnBlur() {
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 0);
  }

  // Has to be onMouseDownCapture to avoid section outline flashing
  // when section is locked.
  function localOnMouseDownCapture(event: MouseEvent<HTMLElement>) {
    if (isDisabled) {
      return;
    }
    if (event.button === 0) {
      // Only the activating coordinates survive into state; the reference stores the event
      // object and reads the same two fields.
      setActivationEvent({ clientX: event.clientX, clientY: event.clientY });
      applyActiveSectionChange({ interaction: "input-focus", sectionId });
    }
  }

  // focused via tab key
  function onFocus() {
    if (isDisabled) {
      return;
    }
    if (!activationEvent) {
      setActivationEvent("tab");
    }
  }

  const editorLayers = (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          divId={`${sectionId}-${controlId}-${presentationConfig.dummyIdSuffix}`}
          code={value}
          onMouseDownCapture={localOnMouseDownCapture}
          onFocus={onFocus}
          className={presentationConfig.dummyClassName}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          placeholder={placeholder}
          language={language}
          ariaLabel={ariaLabel}
          ariaDisabled={isDisabled}
        />
      )}
      {activationEvent && (
        <LiveTextValueEditor
          ariaLabel={ariaLabel}
          sectionId={sectionId}
          controlId={controlId}
          value={value}
          placeholder={placeholder}
          language={language}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          className={presentationConfig.realClassName}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          onValueChange={onValueChange}
          onEscape={() => focusSectionAfterEscape(sectionId)}
          onBlur={localOnBlur}
        />
      )}
      {renderTextValueDivider(presentationConfig, isSelectingItems)}
    </>
  );
  return wrapTextValueEditorLayers(presentationConfig, editorLayers);
}

function LiveTextValueEditor({
  ariaLabel,
  sectionId,
  controlId,
  value,
  placeholder,
  language,
  singleLine,
  wrapLines,
  theme,
  className,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  onValueChange,
  onEscape,
  onBlur,
}: {
  ariaLabel: string;
  sectionId: string;
  controlId: string;
  value: string;
  placeholder: string | undefined;
  language: TextValueLanguage | null;
  singleLine: boolean;
  wrapLines: boolean | undefined;
  theme: TextValueTheme;
  className: string;
  initialEvent: TextValueActivationEvent;
  realIsInitialized: boolean;
  setRealIsInitialized: (initialized: boolean) => void;
  onValueChange: (nextValue: string) => void;
  onEscape: () => void;
  onBlur: () => void;
}) {
  const editorId = `CodeMirror-${sectionId}-${controlId}`;
  const extensions = [
    ...getTextValueExtensions({ language, singleLine, wrapLines, onEscape }),
    EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
  ];
  const onCreateEditor = getOnCreateEditor({
    initialEvent,
    setRealIsInitialized,
    editorId,
    value,
    placeholder,
  });
  return (
    <CodeMirror
      id={editorId}
      className={`${className} ${!realIsInitialized ? "opacity-0" : ""}`}
      value={value}
      placeholder={placeholder}
      basicSetup={TEXT_VALUE_BASIC_SETUP}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
      onChange={(nextValue) => onValueChange(nextValue)}
      onBlur={onBlur}
      indentWithTab={false} // the reference binds Tab in its app extensions; the package binds none
      tabIndex={0} // keep focusable for tab navigation
    />
  );
}
