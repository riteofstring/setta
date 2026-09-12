import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import type { ReactNode } from "react";
import {
  getTextValueLanguageParser,
  type TextValueParserLike,
} from "./textValueLanguages";
import { getThemeHighlightStyle, type TextValueTheme } from "./textValueTheme";

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

export function buildPlainCodeLines(code: string): Array<ReactNode> {
  return code.split("\n").map((line, index) => (
    <div key={`line-${index + 1}`} className="cm-line">
      {line || <br />}
    </div>
  ));
}

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
