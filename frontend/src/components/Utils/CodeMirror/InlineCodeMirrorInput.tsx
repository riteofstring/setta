import type { CompletionSource } from "@codemirror/autocomplete";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { getExtensions } from "./getExtensions";
import { useCodeMirrorStyle } from "./useCodeMirrorStyle";
import { useCodeMirrorTooltipParent } from "./useCodeMirrorTooltipParent";

type InlineCodeMirrorInputProps = {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  dummyClassName?: string;
  singleLine?: boolean;
  wrapLines?: boolean;
  completionsFn?: CompletionSource;
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
  tabToAutocomplete = true,
  keyComboActions,
  onTab,
  onEnter,
  triggerCompletionAfterAccept,
  completionTriggerChars,
  tooltipParentDivId,
}: InlineCodeMirrorInputProps) {
  const theme = useCodeMirrorStyle();
  const tooltipParent = useCodeMirrorTooltipParent(tooltipParentDivId);
  const isBrowser = typeof window !== "undefined";

  function localOnBlur() {
    onBlur?.();
  }

  const extensions = useMemo(() => {
    if (!isBrowser) {
      return [];
    }
    return getExtensions({
      parent: tooltipParent,
      completionsFn,
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
      indentWithTab={false}
      tabIndex={0}
    />
  );
}
