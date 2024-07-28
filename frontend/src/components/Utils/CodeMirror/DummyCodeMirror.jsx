import { pythonLanguage } from "@codemirror/lang-python";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import { useKeywordRegex } from "state/definitions";
import { roundUpIdx } from "./utils";
// import {HighlightStyle} from "@codemirror/language"

const lineWrapStyle = {
  whiteSpace: "break-spaces",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  flexShrink: 1,
};



//https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053
//https://github.com/jamischarles/codemirror-server-render
export function DummyCodeMirror({
  code,
  theme,
  onMouseDown,
  className,
  keywordRegex,
  goToSectionOnNameClick,
  placeholder,
  language,
}) {
  return code ? (
    <HighlightedCode
      code={code}
      theme={theme}
      onMouseDown={onMouseDown}
      className={className}
      keywordRegex={keywordRegex}
      goToSectionOnNameClick={goToSectionOnNameClick}
      language={language}
    />
  ) : (
    <PlaceholderCode
      className={className}
      placeholder={placeholder}
      onMouseDown={onMouseDown}
    />
  );
}

function PlaceholderCode({ className, placeholder, onMouseDown }) {
  // returns <br/> if no placeholder, so that the div takes up space
  return (
    <span
      className={`${className} text-gray-600`}
      style={lineWrapStyle}
      onMouseDown={onMouseDown}
    >
      {placeholder ? placeholder : <br />}
    </span>
  );
}

function HighlightedCode({
  code,
  theme,
  onMouseDown,
  className,
  keywordRegex,
  goToSectionOnNameClick,
  language,
}) {
  const tree = getTreeParser(code, language);
  const highlightStyle = theme[1][2].value;

  console.log("highlightStyle", highlightStyle)
  const markCache = {};
  const builder = new RangeSetBuilder();

  let match;
  const matchedIndices = {};
  while ((match = keywordRegex.exec(code))) {
    const [from, to] = [match.index, match.index + match[0].length];
    matchedIndices[match.index] = {
      keywordStartIdx: from,
      keywordEndIdx: to,
      keyword: code.substring(from, to),
    };
  }

  console.log("matchedIndices", matchedIndices)

  if (tree) {
    highlightTree(tree, highlightStyle, (from, to, style) => {
      builder.add(
        from,
        to,
        markCache[style] ||
          (markCache[style] = Decoration.mark({ class: style })),
      );
    });
  }

  // just the decorations NOT the code itself
  const decorationRangeSet = builder.finish();
  // just the code content. MUST be array of lines
  const text = Text.of(code.split("\n"));
  const outputDivs = [];
  let pos, isJustLineBreak;
  let [
    currKeyword,
    currKeywordStartIdx,
    currKeywordEndIdx,
    currComponentIndices,
  ] = [null, null, null, null];
  const fullNameToInfo = useKeywordRegex.getState().fullNameToInfo;

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    const cursor = decorationRangeSet.iter(line.from);
    isJustLineBreak = true;
    pos = line.from;

    const currLineDivs = [];

    while (cursor.value && cursor.from < line.to) {
      isJustLineBreak = false;
      if (cursor.from > pos) {
        currLineDivs.push(text.sliceString(pos, cursor.from));
      }

      console.log("cursor", cursor)

      if (currKeyword === null && cursor.from in matchedIndices) {
        const { keyword, keywordStartIdx, keywordEndIdx } =
          matchedIndices[cursor.from];
        currKeyword = keyword;
        currKeywordStartIdx = keywordStartIdx;
        currKeywordEndIdx = keywordEndIdx;
        currComponentIndices = fullNameToInfo[currKeyword].componentIndices;
      }

      console.log("currKeyword", currKeyword)

      const className = `${cursor.value.spec.class} ${currKeyword ? "italic" : ""}`;
      const slicedKeyword = currKeyword
        ? currKeyword.slice(
            0,
            roundUpIdx(currComponentIndices, cursor.to - currKeywordStartIdx),
          )
        : null;
      const onClick = currKeyword
        ? (event) =>
            goToSectionOnNameClick({
              event,
              variable: slicedKeyword,
            })
        : () => {};

      currLineDivs.push(
        <span
          key={`line-${i}-${cursor.from}`}
          className={className}
          onClick={onClick}
        >
          {text.sliceString(cursor.from, Math.min(line.to, cursor.to))}
        </span>,
      );
      pos = cursor.to;
      if (pos >= currKeywordEndIdx) {
        currKeyword = null;
        currKeywordStartIdx = null;
        currKeywordEndIdx = null;
        currComponentIndices = null;
      }
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
      className={`${className} ${scopeClassName}`}
      style={lineWrapStyle}
      onMouseDown={onMouseDown}
    >
      {outputDivs}
    </div>
  );
}

function getTreeParser(code, language) {
  if (language === "python") {
    return pythonLanguage.parser.parse(code);
  }
  return null;
}
