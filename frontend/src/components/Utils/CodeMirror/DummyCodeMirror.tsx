import React from "react";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import { getCodeMirrorLanguageParser } from "./codeMirrorLanguages";

const lineWrapStyle = {
  whiteSpace: "break-spaces",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  flexShrink: 1,
};
const singleLineStyle = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  flexShrink: 1,
};

function joinClassNames(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}
//https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053
//https://github.com/jamischarles/codemirror-server-render
export function DummyCodeMirror({
  divId,
  code,
  theme,
  onMouseDownCapture,
  onFocus,
  className,
  placeholder,
  language,
  useJsx = false,
  singleLine = false,
  wrapLines,
}) {
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
      useJsx={useJsx}
      singleLine={singleLine}
      style={resolvedStyle}
    />
  ) : (
    <PlaceholderCode
      divId={divId}
      className={className}
      placeholder={placeholder}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      style={resolvedStyle}
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
}) {
  // returns <br/> if no placeholder, so that the div takes up space
  return (
    <span
      id={divId}
      className={`${className} text-gray-600 outline-none`}
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      tabIndex={0}
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
  useJsx,
  singleLine,
  onFocus,
  style,
}) {
  const parser = getCodeMirrorLanguageParser(language, useJsx);
  if (!parser) {
    if (singleLine || !code.includes("\n")) {
      return (
        <div
          id={divId}
          className={joinClassNames(className, "outline-none")}
          style={style}
          onMouseDownCapture={onMouseDownCapture}
          onFocus={onFocus}
          tabIndex={0}
        >
          {code}
        </div>
      );
    }
    return (
      <div
        id={divId}
        className={joinClassNames(className, "outline-none")}
        style={style}
        onMouseDownCapture={onMouseDownCapture}
        onFocus={onFocus}
        tabIndex={0}
      >
        {code.split("\n").map((line, index) => (
          <div key={`line-${index + 1}`} className="cm-line">
            {line || <br />}
          </div>
        ))}
      </div>
    );
  }
  const tree = parser.parse(code);
  const highlightStyle = theme[1][2].value;
  const markCache = {};
  const builder = new RangeSetBuilder();

  highlightTree(tree, highlightStyle, (from, to, style) => {
    builder.add(
      from,
      to,
      markCache[style] ||
        (markCache[style] = Decoration.mark({ class: style })),
    );
  });

  // just the decorations NOT the code itself
  const decorationRangeSet = builder.finish();
  // just the code content. MUST be array of lines
  const text = Text.of(code.split("\n"));
  const scopeClassName = theme[0][0]?.value || "";
  const baseClassName = joinClassNames(className, scopeClassName, "outline-none");
  const renderInline = singleLine || text.lines === 1;
  if (renderInline) {
    const inlineNodes = [];
    const textLength = text.length;
    let pos = 0;
    const cursor = decorationRangeSet.iter();

    while (cursor.value) {
      const from = Math.min(cursor.from, textLength);
      const to = Math.min(cursor.to, textLength);

      if (from > pos) {
        inlineNodes.push(text.sliceString(pos, from));
      }

      const className = cursor.value.spec.class;
      inlineNodes.push(
        <span key={`single-line-${from}-${to}`} className={className}>
          {text.sliceString(from, to)}
        </span>,
      );
      pos = to;
      cursor.next();
    }

    if (pos < textLength) {
      inlineNodes.push(text.sliceString(pos, textLength));
    }

    if (
      inlineNodes.length === 1 &&
      React.isValidElement(inlineNodes[0]) &&
      inlineNodes[0].type === "span"
    ) {
      const onlySpan = inlineNodes[0];
      const onlySpanClassName =
        typeof onlySpan.props.className === "string"
          ? onlySpan.props.className
          : undefined;
      const flattenedClassName = joinClassNames(baseClassName, onlySpanClassName);

      return (
        <div
          id={divId}
          className={flattenedClassName}
          style={style}
          onMouseDownCapture={onMouseDownCapture}
          onFocus={onFocus}
          tabIndex={0}
        >
          {onlySpan.props.children}
        </div>
      );
    }

    return (
      <div
        id={divId}
        className={baseClassName}
        style={style}
        onMouseDownCapture={onMouseDownCapture}
        onFocus={onFocus}
        tabIndex={0}
      >
        {inlineNodes}
      </div>
    );
  }

  const outputDivs = [];
  let pos, isJustLineBreak;

  const cursor = decorationRangeSet.iter();

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    isJustLineBreak = true;
    pos = line.from;

    const currLineDivs = [];

    while (cursor.value && cursor.from < line.to) {
      isJustLineBreak = false;
      if (cursor.from > pos) {
        currLineDivs.push(text.sliceString(pos, cursor.from));
      }

      const className = cursor.value.spec.class;

      currLineDivs.push(
        <span key={`line-${i}-${cursor.from}`} className={className}>
          {text.sliceString(cursor.from, Math.min(line.to, cursor.to))}
        </span>,
      );
      pos = cursor.to;
      cursor.next();
    }
    currLineDivs.push(text.sliceString(pos, line.to));
    if (isJustLineBreak) {
      currLineDivs.push(<br key={`br-${i}`} />);
    }
    outputDivs.push(
      <div key={`line-${i}`} className="cm-line">
        {currLineDivs}
      </div>,
    );
  }

  // "ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"
  // ${highlightStyles.scopeClassName}
  // TODO: the style object here seems to reduce performance
  return (
    <div
      id={divId}
      className={baseClassName}
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      tabIndex={0}
    >
      {outputDivs}
    </div>
  );
}
