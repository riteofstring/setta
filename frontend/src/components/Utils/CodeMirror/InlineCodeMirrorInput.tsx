import type { CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useRef } from "react";
import { getExtensions } from "./getExtensions";
import { useCodeMirrorStyle } from "./useCodeMirrorStyle";
import { useCodeMirrorTooltipParent } from "./useCodeMirrorTooltipParent";

type InlineCodeMirrorInputProps = {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  className?: string;
  dummyClassName?: string;
  singleLine?: boolean;
  wrapLines?: boolean;
  completionsFn?: CompletionSource;
  completionInteractionDelayMs?: number;
  tabToAutocomplete?: boolean;
  keyComboActions?: Record<string, (text: string) => boolean | void>;
  onTab?: (text: string, completionResult: boolean) => void;
  onEnter?: (text: string, completionResult: boolean) => void;
  triggerCompletionAfterAccept?: boolean;
  completionTriggerChars?: string[];
  tooltipParentDivId?: string | null;
};

export function InlineCodeMirrorInput({
  id,
  value,
  placeholder,
  onChange,
  onBlur,
  className,
  dummyClassName,
  singleLine = true,
  wrapLines,
  completionsFn,
  completionInteractionDelayMs,
  tabToAutocomplete = true,
  keyComboActions,
  onTab,
  onEnter,
  triggerCompletionAfterAccept,
  completionTriggerChars,
  tooltipParentDivId,
}: InlineCodeMirrorInputProps) {
  const theme = useCodeMirrorStyle(undefined, { fontFamily: "inherit" });
  const tooltipParent = useCodeMirrorTooltipParent(tooltipParentDivId);
  const isBrowser = typeof window !== "undefined";
  const viewRef = useRef<EditorView | null>(null);

  function localOnBlur() {
    // Read the latest value directly from the EditorView to avoid race
    // conditions where the controlled React value hasn't flushed yet.
    const latest = viewRef.current?.state.doc.toString() ?? value;
    onBlur?.(latest);
  }

  const extensions = useMemo(() => {
    if (!isBrowser) {
      return [];
    }
    return getExtensions({
      parent: tooltipParent,
      completionsFn,
      completionInteractionDelayMs,
      singleLine,
      wrapLines,
      tabToAutocomplete,
      keyComboActions,
      onTab,
      onEnter,
      triggerCompletionAfterAccept,
      completionTriggerChars,
    });
  }, [
    isBrowser,
    tooltipParent,
    completionsFn,
    completionInteractionDelayMs,
    singleLine,
    wrapLines,
    tabToAutocomplete,
    keyComboActions,
    onTab,
    onEnter,
    triggerCompletionAfterAccept,
    completionTriggerChars,
  ]);

  if (!isBrowser) {
    return (
      <span id={id} className={dummyClassName ?? className}>
        {value || placeholder || ""}
      </span>
    );
  }

  return (
    <CodeMirror
      id={id}
      className={className ?? ""}
      value={value}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        tabSize: 4,
      }}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      onBlur={localOnBlur}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
      indentWithTab={false}
      tabIndex={0}
    />
  );
}
