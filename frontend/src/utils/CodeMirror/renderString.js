import { pythonLanguage } from "@codemirror/lang-python";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";

//https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053
//https://github.com/jamischarles/codemirror-server-render
export function renderString({ code, theme }) {
  const tree = pythonLanguage.parser.parse(code);
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
  let str = "";
  let pos, lineInnerHtml;

  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    const cursor = decorationRangeSet.iter(line.from);
    pos = line.from;
    lineInnerHtml = "";

    while (cursor.value && cursor.from < line.to) {
      if (cursor.from > pos) {
        lineInnerHtml += `${text.sliceString(pos, cursor.from)}`;
      }
      lineInnerHtml += `<span class="${cursor.value.spec.class}">${text.sliceString(cursor.from, Math.min(line.to, cursor.to))}</span>`;
      pos = cursor.to;
      cursor.next();
    }
    if (pos < line.to) {
      lineInnerHtml += `${text.sliceString(pos, line.to)}`;
    }
    str += lineInnerHtml || "<br/>";
  }

  // "ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"
  // ${highlightStyles.scopeClassName}
  const scopeClassName = theme[0][0]?.value || "";
  return {
    code: `<div class="${scopeClassName}">${str}</div>`,
  };
}
