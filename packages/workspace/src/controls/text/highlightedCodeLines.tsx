import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import type { ReactNode } from "react";
import {
  getTextValueLanguageParser,
  type TextValueParserLike,
} from "./textValueLanguages";
import { getThemeHighlightStyle, type TextValueTheme } from "./textValueTheme";

// The reference's server-render-style highlight, shared by every idle (non-editing) surface that
// paints committed code: the item value editor's dummy layer and the Text section's fenced
// Markdown code blocks. Both need the same `cm-line` structure and the same highlight classes the
// live editor registers, so the parse and the decoration walk have one owner.
// https://discuss.codemirror.net/t/server-side-rendering-for-read-only-codeblocks-in-cm6/4053

function buildDecorationRangeSet(
  code: string,
  theme: TextValueTheme,
  parser: TextValueParserLike,
) {
  const tree = parser.parse(code);
  const highlightStyle = getThemeHighlightStyle(theme);
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
  return builder.finish();
}

type DecorationCursor = ReturnType<
  ReturnType<typeof buildDecorationRangeSet>["iter"]
>;

function buildLineNodes(
  text: Text,
  lineNumber: number,
  cursor: DecorationCursor,
): Array<ReactNode> {
  const line = text.line(lineNumber);
  let isJustLineBreak = true;
  let pos = line.from;
  const currLineDivs: Array<ReactNode> = [];

  while (cursor.value && cursor.from < line.to) {
    isJustLineBreak = false;
    if (cursor.from > pos) {
      currLineDivs.push(text.sliceString(pos, cursor.from));
    }
    const spanClassName: string = cursor.value.spec.class;
    currLineDivs.push(
      <span key={`line-${lineNumber}-${cursor.from}`} className={spanClassName}>
        {text.sliceString(cursor.from, Math.min(line.to, cursor.to))}
      </span>,
    );
    pos = cursor.to;
    cursor.next();
  }
  currLineDivs.push(text.sliceString(pos, line.to));
  if (isJustLineBreak) {
    currLineDivs.push(<br key={`br-${lineNumber}`} />);
  }
  return currLineDivs;
}

// The unhighlighted form: one `cm-line` per source line, which a language without a registered
// parser and the reference's plain fenced blocks both render.
export function buildPlainCodeLines(code: string): Array<ReactNode> {
  return code.split("\n").map((line, index) => (
    <div key={`line-${index + 1}`} className="cm-line">
      {line || <br />}
    </div>
  ));
}

// Returns null when the language has no registered parser, so callers fall back to the plain form
// instead of silently painting unhighlighted lines through the highlighted path.
export function buildHighlightedCodeLines(
  code: string,
  theme: TextValueTheme,
  language: Parameters<typeof getTextValueLanguageParser>[0],
): Array<ReactNode> | null {
  const parser = getTextValueLanguageParser(language);
  if (!parser) {
    return null;
  }
  const decorationRangeSet = buildDecorationRangeSet(code, theme, parser);
  // just the code content. MUST be array of lines
  const text = Text.of(code.split("\n"));
  const cursor = decorationRangeSet.iter();
  const outputDivs: Array<ReactNode> = [];
  for (let i = 1; i <= text.lines; i++) {
    outputDivs.push(
      <div key={`line-${i}`} className="cm-line">
        {buildLineNodes(text, i, cursor)}
      </div>,
    );
  }
  return outputDivs;
}
