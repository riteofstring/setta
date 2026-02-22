import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import React from "react";
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

const HIGHLIGHT_CACHE_MAX_ENTRIES = 240;

type DummyCodeMirrorTheme = Array<Array<{ value?: unknown } | null>>;
type HighlightedCodeOutput = {
  outputDivs: React.ReactNode[];
  scopeClassName: string;
};

type HighlightParser = {
  parse: (value: string) => Parameters<typeof highlightTree>[0];
};

type HighlightLineSegment = {
  from: number;
  to: number;
  className: string;
};

const highlightedOutputCache = new Map<string, HighlightedCodeOutput>();
let themeCacheKeyByReference = new WeakMap<object, string>();
let nextThemeCacheKey = 1;

function getThemeCacheKey(theme: DummyCodeMirrorTheme): string {
  const existingKey = themeCacheKeyByReference.get(theme);
  if (existingKey) {
    return existingKey;
  }
  const nextKey = `theme-${nextThemeCacheKey}`;
  nextThemeCacheKey += 1;
  themeCacheKeyByReference.set(theme, nextKey);
  return nextKey;
}

function toHighlightCacheKey({
  code,
  language,
  theme,
}: {
  code: string;
  language: string;
  theme: DummyCodeMirrorTheme;
}): string {
  return `${language}::${getThemeCacheKey(theme)}::${code}`;
}

function buildHighlightedCodeOutput({
  code,
  parser,
  theme,
}: {
  code: string;
  parser: HighlightParser;
  theme: DummyCodeMirrorTheme;
}): HighlightedCodeOutput {
  const tree = parser.parse(code);
  const highlightStyle = theme[1]?.[2]?.value as Parameters<
    typeof highlightTree
  >[1];
  const markCache: Record<string, Decoration> = {};
  const builder = new RangeSetBuilder<Decoration>();

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
  const renderedLineDivs: React.ReactNode[] = [];
  const cursor = decorationRangeSet.iter();

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    const lineSegments: Array<HighlightLineSegment> = [];
    const currLineDivs: React.ReactNode[] = [];

    while (cursor.value && cursor.from < line.to) {
      const segmentTo = Math.min(line.to, cursor.to);
      if (segmentTo > cursor.from) {
        lineSegments.push({
          from: cursor.from,
          to: segmentTo,
          className: String(cursor.value.spec.class ?? ""),
        });
      }
      cursor.next();
    }

    const mergedLineSegments = mergeAdjacentLineSegments(lineSegments);
    if (mergedLineSegments.length === 0) {
      currLineDivs.push(text.sliceString(line.from, line.to));
      currLineDivs.push(<br key={`br-${i}`} />);
    } else {
      let pos = line.from;
      for (const segment of mergedLineSegments) {
        if (segment.from > pos) {
          currLineDivs.push(text.sliceString(pos, segment.from));
        }
        currLineDivs.push(
          <span key={`line-${i}-${segment.from}`} className={segment.className}>
            {text.sliceString(segment.from, segment.to)}
          </span>,
        );
        pos = segment.to;
      }
      currLineDivs.push(text.sliceString(pos, line.to));
    }
    renderedLineDivs.push(
      <div key={`line-${i}`} className="cm-line">
        {currLineDivs}
      </div>,
    );
  }

  return {
    outputDivs: renderedLineDivs,
    scopeClassName: String(theme[0]?.[0]?.value || ""),
  };
}

function mergeAdjacentLineSegments(
  lineSegments: Array<HighlightLineSegment>,
): Array<HighlightLineSegment> {
  if (lineSegments.length < 2) {
    return lineSegments;
  }
  const merged: Array<HighlightLineSegment> = [];
  let current = lineSegments[0];
  for (let index = 1; index < lineSegments.length; index += 1) {
    const next = lineSegments[index];
    if (current.className === next.className && current.to === next.from) {
      current = {
        from: current.from,
        to: next.to,
        className: current.className,
      };
      continue;
    }
    merged.push(current);
    current = next;
  }
  merged.push(current);
  return merged;
}

export function clearDummyCodeMirrorHighlightCache() {
  highlightedOutputCache.clear();
  themeCacheKeyByReference = new WeakMap<object, string>();
  nextThemeCacheKey = 1;
}

export function getCachedHighlightedCodeOutput({
  code,
  language,
  parser,
  theme,
}: {
  code: string;
  language: string;
  parser: HighlightParser;
  theme: DummyCodeMirrorTheme;
}): HighlightedCodeOutput {
  const cacheKey = toHighlightCacheKey({ code, language, theme });
  const cachedOutput = highlightedOutputCache.get(cacheKey);
  if (cachedOutput) {
    highlightedOutputCache.delete(cacheKey);
    highlightedOutputCache.set(cacheKey, cachedOutput);
    return cachedOutput;
  }

  const nextOutput = buildHighlightedCodeOutput({
    code,
    parser,
    theme,
  });
  highlightedOutputCache.set(cacheKey, nextOutput);
  if (highlightedOutputCache.size > HIGHLIGHT_CACHE_MAX_ENTRIES) {
    const oldestKey = highlightedOutputCache.keys().next().value;
    if (oldestKey) {
      highlightedOutputCache.delete(oldestKey);
    }
  }
  return nextOutput;
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
  onFocus,
  style,
}) {
  const parser = React.useMemo(
    () =>
      getCodeMirrorLanguageParser(language, false) as HighlightParser | null,
    [language],
  );
  const fallbackLines = React.useMemo(() => code.split("\n"), [code]);
  if (!parser) {
    return (
      <div
        id={divId}
        className={`${className} outline-none`}
        style={style}
        onMouseDownCapture={onMouseDownCapture}
        onFocus={onFocus}
        tabIndex={0}
      >
        {fallbackLines.map((line, index) => (
          <div key={`line-${index + 1}`} className="cm-line">
            {line || <br />}
          </div>
        ))}
      </div>
    );
  }
  const { outputDivs, scopeClassName } = React.useMemo(
    () =>
      getCachedHighlightedCodeOutput({
        code,
        language,
        parser,
        theme: theme as DummyCodeMirrorTheme,
      }),
    [code, language, parser, theme],
  );

  // TODO: the style object here seems to reduce performance
  return (
    <div
      id={divId}
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
