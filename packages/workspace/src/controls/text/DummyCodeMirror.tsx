import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import type { CSSProperties, FocusEventHandler, MouseEventHandler, ReactNode } from "react";
import {
  getTextValueLanguageParser,
  type TextValueLanguage,
  type TextValueParserLike,
} from "./textValueLanguages";
import {
  getThemeHighlightStyle,
  getThemeScopeClassName,
  type TextValueTheme,
} from "./textValueTheme";

// The reference's `DummyCodeMirror` idle layer, trimmed of its file-path/JSX variants: a
// server-render-style highlight of the committed value (or its placeholder form) that stands
// in for the live editor until activation. The role is the one the live editor's content
// element advertises; the reference renders role-less nodes, but this repository's
// accessibility gate requires the interactive role on the focusable layer.
// https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053

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
};

type DummyCodeMirrorProps = DummyInteractionProps & {
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
}: DummyInteractionProps & { placeholder: string | undefined; style: CSSProperties }) {
  // returns <br/> if no placeholder, so that the div takes up space
  return (
    <span
      id={divId}
      className={`${className} text-gray-600 outline-none`}
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      role="textbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-disabled={ariaDisabled || undefined}
    >
      {placeholder ? placeholder : <br />}
    </span>
  );
}

function buildDecorationRangeSet(code: string, theme: TextValueTheme, parser: TextValueParserLike) {
  const tree = parser.parse(code);
  const highlightStyle = getThemeHighlightStyle(theme);
  const markCache: Record<string, Decoration> = {};
  const builder = new RangeSetBuilder<Decoration>();
  highlightTree(tree, highlightStyle, (from, to, style) => {
    builder.add(
      from,
      to,
      markCache[style] || (markCache[style] = Decoration.mark({ class: style })),
    );
  });
  // just the decorations NOT the code itself
  return builder.finish();
}

type DecorationCursor = ReturnType<ReturnType<typeof buildDecorationRangeSet>["iter"]>;

function buildLineNodes(
  text: Text,
  lineNumber: number,
  cursor: DecorationCursor,
): Array<ReactNode> {
  const line = text.line(lineNumber);
  let isJustLineBreak = true;
  let pos = line.from;
  const currLineDivs: Array<ReactNode> = [];

  while (cursor.value && cursor.from < line.to) {
    isJustLineBreak = false;
    if (cursor.from > pos) {
      currLineDivs.push(text.sliceString(pos, cursor.from));
    }
    const spanClassName: string = cursor.value.spec.class;
    currLineDivs.push(
      <span key={`line-${lineNumber}-${cursor.from}`} className={spanClassName}>
        {text.sliceString(cursor.from, Math.min(line.to, cursor.to))}
      </span>,
    );
    pos = cursor.to;
    cursor.next();
  }
  currLineDivs.push(text.sliceString(pos, line.to));
  if (isJustLineBreak) {
    currLineDivs.push(<br key={`br-${lineNumber}`} />);
  }
  return currLineDivs;
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
}: DummyInteractionProps & {
  code: string;
  theme: TextValueTheme;
  language: TextValueLanguage | null | undefined;
  style: CSSProperties;
}) {
  const parser = getTextValueLanguageParser(language);
  if (!parser) {
    return (
      <div
        id={divId}
        className={`${className} outline-none`}
        style={style}
        onMouseDownCapture={onMouseDownCapture}
        onFocus={onFocus}
        role="textbox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-disabled={ariaDisabled || undefined}
      >
        {code.split("\n").map((line, index) => (
          <div key={`line-${index + 1}`} className="cm-line">
            {line || <br />}
          </div>
        ))}
      </div>
    );
  }

  const decorationRangeSet = buildDecorationRangeSet(code, theme, parser);
  // just the code content. MUST be array of lines
  const text = Text.of(code.split("\n"));
  const cursor = decorationRangeSet.iter();
  const outputDivs: Array<ReactNode> = [];
  for (let i = 1; i <= text.lines; i++) {
    outputDivs.push(
      <div key={`line-${i}`} className="cm-line">
        {buildLineNodes(text, i, cursor)}
      </div>,
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
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-disabled={ariaDisabled || undefined}
    >
      {outputDivs}
    </div>
  );
}
