import { pythonLanguage } from "@codemirror/lang-python";
import { HighlightStyle } from "@codemirror/language";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree, tags as t } from "@lezer/highlight";
import { githubDarkInit } from "@uiw/codemirror-theme-github";

const styles = [
  { tag: [t.standard(t.tagName), t.tagName], color: "#7ee787" },
  { tag: [t.comment, t.bracket], color: "#8b949e" },
  { tag: [t.className, t.propertyName], color: "#d2a8ff" },
  {
    tag: [t.variableName, t.attributeName, t.number, t.operator],
    color: "#79c0ff",
  },
  {
    tag: [t.keyword, t.typeName, t.typeOperator, t.typeName],
    color: "#ff7b72",
  },
  { tag: [t.string, t.meta, t.regexp], color: "#a5d6ff" },
  { tag: [t.name, t.quote], color: "#7ee787" },
  { tag: [t.heading, t.strong], color: "#d2a8ff", fontWeight: "bold" },
  { tag: [t.emphasis], color: "#d2a8ff", fontStyle: "italic" },
  { tag: [t.deleted], color: "#ffdcd7", backgroundColor: "ffeef0" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#ffab70" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "#f97583" },
];

const githubDarkTheme = githubDarkInit({
  settings: {
    background: "#ffffff00",
    gutterBackground: "#FFFFFF00",
    // fontFamily:
    //   "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
    // gutterForeground: "#4D4D4C00",
    gutterBorder: "#dddddd00",
  },
});

export function renderString({
  code,
  //   highlightStyle,
  //   theme,
  cfg = {},
}) {
  const tree = pythonLanguage.parser.parse(code);
  const highlightStyle = HighlightStyle.define(styles);
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
    githubDarkTheme[0],
  );

  // "ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"
  // ${highlightStyles.scopeClassName}
  return {
    code: `<div class="cm-editor ͼ1 ͼ3 ͼ4 ͼ1ng ͼ21"><div class="cm-scroller"><div class="cm-content">${str}</div></div></div>`,
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
