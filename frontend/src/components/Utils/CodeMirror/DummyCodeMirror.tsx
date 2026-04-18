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
//https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053
//https://github.com/jamischarles/codemirror-server-render
export function DummyCodeMirror({
  canvasOwnedRestingText = false,
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
  if (canvasOwnedRestingText) {
    return (
      <CanvasOwnedRestingTextRoot
        divId={divId}
        code={code}
        className={className}
        placeholder={placeholder}
        onMouseDownCapture={onMouseDownCapture}
        onFocus={onFocus}
        style={resolvedStyle}
      />
    );
  }
  return code ? (
    <HighlightedCode
      divId={divId}
      canvasOwnedRestingText={canvasOwnedRestingText}
      code={code}
      theme={theme}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      className={className}
      language={language}
      useJsx={useJsx}
      style={resolvedStyle}
    />
  ) : (
    <PlaceholderCode
      divId={divId}
      canvasOwnedRestingText={canvasOwnedRestingText}
      className={className}
      placeholder={placeholder}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      style={resolvedStyle}
    />
  );
}

function CanvasOwnedRestingTextRoot({
  divId,
  code,
  className,
  placeholder,
  onMouseDownCapture,
  onFocus,
  style,
}) {
  const lines =
    typeof code === "string" && code.length > 0 ? code.split("\n") : null;
  const hasMultipleLines = (lines?.length ?? 0) > 1;
  const placeholderText =
    lines === null &&
    typeof placeholder === "string" &&
    placeholder.length > 0
      ? placeholder
      : null;

  return (
    <div
      id={divId}
      className={`${className} outline-none ${placeholderText ? "text-gray-600" : ""}`}
      data-canvas-owned-resting-text="true"
      data-canvas-owned-resting-text-lightweight="true"
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      tabIndex={0}
    >
      {hasMultipleLines
        ? lines.map((line, index) => (
            <div key={`line-${index + 1}`} className="cm-line">
              {line || <br />}
            </div>
          ))
        : lines?.[0] ?? placeholderText ?? <br />}
    </div>
  );
}

function PlaceholderCode({
  canvasOwnedRestingText,
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
      data-canvas-owned-resting-text={
        canvasOwnedRestingText ? "true" : undefined
      }
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
  canvasOwnedRestingText,
  divId,
  code,
  theme,
  onMouseDownCapture,
  className,
  language,
  useJsx,
  onFocus,
  style,
}) {
  const parser = getCodeMirrorLanguageParser(language, useJsx);
  if (!parser) {
    return (
      <div
        id={divId}
        className={`${className} outline-none`}
        data-canvas-owned-resting-text={
          canvasOwnedRestingText ? "true" : undefined
        }
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
  const scopeClassName = theme[0][0]?.value || "";

  // TODO: the style object here seems to reduce performance
  return (
    <div
      id={divId}
      className={`${className} ${scopeClassName} outline-none`}
      data-canvas-owned-resting-text={
        canvasOwnedRestingText ? "true" : undefined
      }
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      tabIndex={0}
    >
      {outputDivs}
    </div>
  );
}
