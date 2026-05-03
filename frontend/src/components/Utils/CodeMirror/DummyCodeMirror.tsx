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
  divId,
  code,
  theme,
  onMouseDownCapture,
  onFocus,
  className,
  placeholder,
  language,
  gpuFlowControl,
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
      gpuFlowControl={gpuFlowControl}
      useJsx={useJsx}
      style={resolvedStyle}
    />
  ) : (
    <PlaceholderCode
      divId={divId}
      className={className}
      placeholder={placeholder}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      gpuFlowControl={gpuFlowControl}
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
  gpuFlowControl,
  style,
}) {
  const gpuFlowAttributes = getGpuFlowCodeMirrorAttributes(gpuFlowControl);
  // returns <br/> if no placeholder, so that the div takes up space
  return (
    <span
      id={divId}
      {...gpuFlowAttributes}
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
  onFocus,
  gpuFlowControl,
  style,
}) {
  const gpuFlowAttributes = getGpuFlowCodeMirrorAttributes(gpuFlowControl);
  const parser = getCodeMirrorLanguageParser(language, useJsx);
  if (!parser) {
    return (
      <div
        id={divId}
        {...gpuFlowAttributes}
        className={`${className} outline-none`}
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
      {...gpuFlowAttributes}
      className={`${className} ${scopeClassName} outline-none`}
      style={style}
      onMouseDownCapture={onMouseDownCapture}
      onFocus={onFocus}
      tabIndex={0}
    >
      {outputDivs}
    </div>
  );
}

function getGpuFlowCodeMirrorAttributes(gpuFlowControl) {
  if (!gpuFlowControl) {
    return {};
  }
  return {
    "data-gpu-flow-activation": "mousedown",
    "data-gpu-flow-control": gpuFlowControl,
    "data-gpu-flow-interactive": "true",
  };
}
