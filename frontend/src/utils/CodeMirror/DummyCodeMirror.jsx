import { pythonLanguage } from "@codemirror/lang-python";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";

//https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053
//https://github.com/jamischarles/codemirror-server-render
export function DummyCodeMirror({
  code,
  theme,
  onMouseDown,
  className,
  keywordRegex,
  goToSectionOnNameClick,
}) {
  const tree = pythonLanguage.parser.parse(code);
  const highlightStyle = theme[1][2].value;
  const markCache = {};
  const builder = new RangeSetBuilder();

  let match;
  const matchedIndices = {};
  while ((match = keywordRegex.exec(code))) {
    matchedIndices[match.index] = code.substring(
      match.index,
      match.index + match[0].length,
    );
  }

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

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    const cursor = decorationRangeSet.iter(line.from);
    isJustLineBreak = true;
    pos = line.from;

    while (cursor.value && cursor.from < line.to) {
      isJustLineBreak = false;
      if (cursor.from > pos) {
        outputDivs.push(text.sliceString(pos, cursor.from));
      }
      const keyword = matchedIndices[cursor.from];
      const className = `${cursor.value.spec.class} ${keyword ? "italic" : ""}`;
      const onClick = keyword
        ? (event) => goToSectionOnNameClick({ event, variable: keyword })
        : () => {};

      outputDivs.push(
        <span
          key={`span-${i}-${cursor.from}`}
          className={className}
          onClick={onClick}
        >
          {text.sliceString(cursor.from, Math.min(line.to, cursor.to))}
        </span>,
      );
      pos = cursor.to;
      cursor.next();
    }
    if (pos < line.to) {
      isJustLineBreak = false;
      outputDivs.push(text.sliceString(pos, line.to));
    }
    if (isJustLineBreak) {
      outputDivs.push(<br key={`br-${i}`}/>);
    }
  }

  // "ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"
  // ${highlightStyles.scopeClassName}
  const scopeClassName = theme[0][0]?.value || "";

  // TODO: the style object here seems to reduce performance
  return (
    <div
      className={`${className} ${scopeClassName}`}
      style={{
        whiteSpace: "break-spaces",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        flexShrink: 1,
      }}
      onMouseDown={onMouseDown}
    >
      {outputDivs}
    </div>
  );
}
