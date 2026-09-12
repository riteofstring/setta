import type {
  CSSProperties,
  FocusEventHandler,
  MouseEventHandler,
} from "react";
import {
  buildHighlightedCodeLines,
  buildPlainCodeLines,
} from "./highlightedCodeLines";
import { type TextValueLanguage } from "./textValueLanguages";
import { getThemeScopeClassName, type TextValueTheme } from "./textValueTheme";

const lineWrapStyle: CSSProperties = {
  whiteSpace: "break-spaces",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  flexShrink: 1,
};
const singleLineStyle: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  flexShrink: 1,
};

type DummyInteractionProps = {
  divId: string;
  className: string;
  onMouseDownCapture: MouseEventHandler<HTMLElement>;
  onFocus: FocusEventHandler<HTMLElement>;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaDisabled?: boolean;
  ariaMultiline: boolean;
};

type DummyCodeMirrorProps = Omit<DummyInteractionProps, "ariaMultiline"> & {
  code: string;
  theme: TextValueTheme;
  placeholder: string | undefined;
  language: TextValueLanguage | null | undefined;
  singleLine: boolean;
  wrapLines: boolean | undefined;
};

export function DummyCodeMirror({
  divId,
  code,
  theme,
  onMouseDownCapture,
  onFocus,
  className,
  placeholder,
  language,
  singleLine,
  wrapLines,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  ariaDisabled,
}: DummyCodeMirrorProps) {
  const shouldWrap = wrapLines ?? !singleLine;
  const resolvedStyle = shouldWrap ? lineWrapStyle : singleLineStyle;
  return code ? (
    <HighlightedCode
      divId={divId}
      code={code}
      theme={theme}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      className={className}
      language={language}
      style={resolvedStyle}
      ariaLabel={ariaLabel}
      ariaDescribedBy={ariaDescribedBy}
      ariaInvalid={ariaInvalid}
      ariaDisabled={ariaDisabled}
      ariaMultiline={!singleLine}
    />
  ) : (
    <PlaceholderCode
      divId={divId}
      className={className}
      placeholder={placeholder}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      style={resolvedStyle}
      ariaLabel={ariaLabel}
      ariaDescribedBy={ariaDescribedBy}
      ariaInvalid={ariaInvalid}
      ariaDisabled={ariaDisabled}
      ariaMultiline={!singleLine}
    />
  );
}

function PlaceholderCode({
  divId,
  className,
  placeholder,
  onMouseDownCapture,
  onFocus,
  style,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  ariaDisabled,
  ariaMultiline,
}: DummyInteractionProps & {
  placeholder: string | undefined;
  style: CSSProperties;
}) {
  return (
    <span
      id={divId}
      className={`${className} text-gray-600 outline-none`}
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      role="textbox"
      tabIndex={ariaDisabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-disabled={ariaDisabled || undefined}
      aria-multiline={ariaMultiline}
    >
      {placeholder ? placeholder : <br />}
    </span>
  );
}

function HighlightedCode({
  divId,
  code,
  theme,
  onMouseDownCapture,
  className,
  language,
  onFocus,
  style,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  ariaDisabled,
  ariaMultiline,
}: DummyInteractionProps & {
  code: string;
  theme: TextValueTheme;
  language: TextValueLanguage | null | undefined;
  style: CSSProperties;
}) {
  const highlightedLines = buildHighlightedCodeLines(code, theme, language);

  if (!highlightedLines) {
    return (
      <div
        id={divId}
        className={`${className} outline-none`}
        style={style}
        onMouseDownCapture={onMouseDownCapture}
        onFocus={onFocus}
        role="textbox"
        tabIndex={ariaDisabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-disabled={ariaDisabled || undefined}
        aria-multiline={ariaMultiline}
      >
        {buildPlainCodeLines(code)}
      </div>
    );
  }

  return (
    <div
      id={divId}
      className={`${className} ${getThemeScopeClassName(theme)} outline-none`}
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      role="textbox"
      tabIndex={ariaDisabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-disabled={ariaDisabled || undefined}
      aria-multiline={ariaMultiline}
    >
      {highlightedLines}
    </div>
  );
}
