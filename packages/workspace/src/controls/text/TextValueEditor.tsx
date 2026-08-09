import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState, type MouseEvent } from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { focusSectionAfterEscape } from "../sectionFocus";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getOnCreateEditor, type TextValueActivationEvent } from "./onCreateEditor";
import { getTextValueExtensions } from "./textValueExtensions";
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

// The reference `ParamUI` class strings for the text control, minus its backend error branch.
function getDummyClassName(isDisabled: boolean) {
  return `${NO_PAN_CLASS_NAME} section-value self-end peer/textinput ${NO_DRAG_CLASS_NAME} ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`;
}

const REAL_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`;

// The value-column divider with its `peer-focus-within` focus treatment; item-select mode
// suppresses the blue focus paint exactly as the reference's param-select mode does.
function getDividerClassName(isSelectingItems: boolean) {
  return `section-value self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingItems ? "peer-focus-within/textinput:border-blue-400" : ""}`;
}

export function TextValueEditor({
  sectionId,
  itemId,
  value,
  onValueChange,
  placeholder,
  language = null,
  singleLine = false,
  wrapLines,
  disabled = false,
}: TextValueEditorProps) {
  const [activationEvent, setActivationEvent] = useState<TextValueActivationEvent | null>(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const isDisabled = disabled || isSelectingItems;
  const theme = useTextValueTheme();

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

  return (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          divId={`${sectionId}-${itemId}-ItemValueInput`}
          code={value}
          onMouseDownCapture={localOnMouseDownCapture}
          onFocus={onFocus}
          className={getDummyClassName(isDisabled)}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          placeholder={placeholder}
          language={language}
        />
      )}
      {activationEvent && (
        <LiveTextValueEditor
          sectionId={sectionId}
          itemId={itemId}
          value={value}
          placeholder={placeholder}
          language={language}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          onValueChange={onValueChange}
          onEscape={() => focusSectionAfterEscape(sectionId)}
          onBlur={localOnBlur}
        />
      )}
      <span className={getDividerClassName(isSelectingItems)} />
    </>
  );
}

function LiveTextValueEditor({
  sectionId,
  itemId,
  value,
  placeholder,
  language,
  singleLine,
  wrapLines,
  theme,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  onValueChange,
  onEscape,
  onBlur,
}: {
  sectionId: string;
  itemId: string;
  value: string;
  placeholder: string | undefined;
  language: TextValueLanguage | null;
  singleLine: boolean;
  wrapLines: boolean | undefined;
  theme: TextValueTheme;
  initialEvent: TextValueActivationEvent;
  realIsInitialized: boolean;
  setRealIsInitialized: (initialized: boolean) => void;
  onValueChange: (nextValue: string) => void;
  onEscape: () => void;
  onBlur: () => void;
}) {
  const editorId = `CodeMirror-${sectionId}-${itemId}`;
  const extensions = getTextValueExtensions({ language, singleLine, wrapLines, onEscape });
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
      className={`${REAL_CLASS_NAME} ${!realIsInitialized ? "opacity-0" : ""}`}
      value={value}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        tabSize: 4,
      }}
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
