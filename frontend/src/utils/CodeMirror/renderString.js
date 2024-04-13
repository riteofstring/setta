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

  // loop through each line of code we need to tokenize
  for (let i = 1; i <= text.lines; i++) {
    const line = text.line(i);
    str += '<div class="cm-line">';

    // reset cursor position to beginning of current line
    pos = line.from;

    // iterate through the current line only
    const curs = decorationRangeSet.iter(line.from);
    pos = line.from; // always start at beginning of the line

    // as long as the iterator has a value, and we haven't reached the end of the current line, keep working
    while (curs.value && curs.from < line.to) {
      //if the next token is after the current position, add the non-tokenized text to the string
      if (curs.from > pos) {
        str += `${text.sliceString(pos, curs.from)}`;
      }

      // get token value from the current cursorPos to end of token (BUT NOT to extend the end of the current line)
      const codeVal = text.sliceString(curs.from, Math.min(curs.to, line.to));
      str += `<${curs.value.tagName} class="${curs.value.class}">${codeVal}</${curs.value.tagName}>`;
      pos = curs.to;

      curs.next();
    }

    // catch up to end of line
    str += `${text.sliceString(pos, line.to)}`;
    pos = line.to; // set pos to end of line...
    str += "</div>"; // closing cm-line div
  }

  const highlightStyles = extractCSSRulesFromThemeHighlightStyle(
    highlightStyle,
    theme[0],
  );

  // "ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"
  // ${highlightStyles.scopeClassName}
  return {
    code: `<div class="cm-editor"><div class="cm-scroller"><div class="cm-content">${str}</div></div></div>`,
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
