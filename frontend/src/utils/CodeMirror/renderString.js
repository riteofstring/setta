import { pythonLanguage } from "@codemirror/lang-python";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";

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
  let pos = 0; // keep track of pos

  for (let i = 1; i <= text.lines; i++) {
    let line = text.line(i),
      pos = line.from,
      cursor = decorationRangeSet.iter(line.from),
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
    str += `<div class="cm-line">${lineInnerHtml || "<br/>"}</div>`;
  }

  const highlightStyles = extractCSSRulesFromThemeHighlightStyle(
    highlightStyle,
    theme[0],
  );

  // "ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"
  // ${highlightStyles.scopeClassName}
  return {
    code: `<pre class="${highlightStyles.scopeClassName}">${str}</pre>`,
    cssRules: highlightStyles.rules,
  };
}

// extracts the CSS style rules needed from the highlightStyle and theme passed in from the codeMirror theme
function extractCSSRulesFromThemeHighlightStyle(highlightStyle, theme = []) {
  const scopeClassName = theme[0]?.value || ""; // top level custom className for scoping added to `.cm-editor` wrapper el
  const rules = [];

  // loop through the theme rules (esp for editor. Things like editor bg color, gutter color etc...)
  for (let i = 1; i < theme.length; i++) {
    if (theme[i].value?.getRules?.()) {
      rules.push(theme[i].value.getRules());
    }
  }

  // add the highlighting rules, which is used for the tokenized code
  rules.push(highlightStyle.module.getRules());

  return {
    scopeClassName,
    rules: rules.join("\n"),
    rawRules: rules,
  };
}
