import { highlightTree, tags as syntaxTags, type Tag } from "@lezer/highlight";
import { getCodeMirrorLanguageParser } from "components/Utils/CodeMirror/codeMirrorLanguages";
import type { CodeLanguage } from "utils/codeLanguage";
import type { WorkspaceCodeTokenRun } from "./workspaceHighlightCache";

export const WORKSPACE_PASSIVE_CODE_HIGHLIGHTER_REVISION =
  "codemirror-lezer-v1";

export type WorkspacePassiveCodeThemeId = "dark" | "light";

export type WorkspacePassiveCodeHighlightRequest = {
  cacheKey: string;
  code: string;
  language: string;
  themeId: WorkspacePassiveCodeThemeId;
  maxLines: number;
  maxColumns: number;
};

type HighlightStyleKey =
  | "default"
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "type"
  | "variable"
  | "operator"
  | "invalid";

type StyledRange = {
  from: number;
  to: number;
  styleKey: HighlightStyleKey;
};

type HighlightVisualStyle = {
  color: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: "normal" | "bold";
};

type HighlightStyleTagRule = {
  styleKey: HighlightStyleKey;
  tags: readonly Tag[];
};

const TOKEN_STYLES: Record<
  WorkspacePassiveCodeThemeId,
  Record<HighlightStyleKey, HighlightVisualStyle>
> = {
  dark: {
    default: { color: "#e5e7eb" },
    comment: { color: "#8b949e", fontStyle: "italic" },
    keyword: { color: "#ff7b72", fontWeight: "bold" },
    string: { color: "#a5d6ff" },
    number: { color: "#79c0ff" },
    type: { color: "#d2a8ff" },
    variable: { color: "#ffa657" },
    operator: { color: "#ff7b72" },
    invalid: { color: "#f85149", fontWeight: "bold" },
  },
  light: {
    default: { color: "#24292f" },
    comment: { color: "#6e7781", fontStyle: "italic" },
    keyword: { color: "#cf222e", fontWeight: "bold" },
    string: { color: "#0a3069" },
    number: { color: "#0550ae" },
    type: { color: "#8250df" },
    variable: { color: "#953800" },
    operator: { color: "#cf222e" },
    invalid: { color: "#cf222e", fontWeight: "bold" },
  },
};

const HIGHLIGHT_STYLE_TAG_RULES: Array<HighlightStyleTagRule> = [
  { styleKey: "invalid", tags: [syntaxTags.invalid] },
  { styleKey: "comment", tags: [syntaxTags.comment] },
  { styleKey: "keyword", tags: [syntaxTags.keyword] },
  { styleKey: "string", tags: [syntaxTags.string] },
  {
    styleKey: "number",
    tags: [syntaxTags.number, syntaxTags.bool, syntaxTags.null],
  },
  { styleKey: "type", tags: [syntaxTags.typeName, syntaxTags.className] },
  {
    styleKey: "variable",
    tags: [syntaxTags.variableName, syntaxTags.propertyName],
  },
  { styleKey: "operator", tags: [syntaxTags.operator, syntaxTags.punctuation] },
];

export function highlightWorkspaceCodePreview({
  code,
  language,
  themeId,
  maxLines,
  maxColumns,
}: WorkspacePassiveCodeHighlightRequest): Array<WorkspaceCodeTokenRun> {
  const boundedCode = boundCodePreview(code, maxLines, maxColumns);
  if (boundedCode.length === 0) {
    return [];
  }
  const parser = getCodeMirrorLanguageParser(language as CodeLanguage, false);
  if (!parser) {
    return [];
  }

  const tree = parser.parse(boundedCode) as Parameters<typeof highlightTree>[0];
  const styledRanges: Array<StyledRange> = [];
  highlightTree(
    tree,
    {
      style(tags) {
        return resolveHighlightStyleKey(tags);
      },
    },
    (from, to, styleKey) => {
      if (from >= to) {
        return;
      }
      styledRanges.push({
        from,
        to,
        styleKey: normalizeHighlightStyleKey(styleKey),
      });
    },
  );

  return buildTokenRunsFromStyledRanges(boundedCode, styledRanges, themeId);
}

function boundCodePreview(code: string, maxLines: number, maxColumns: number) {
  return code
    .split(/\r\n?|\n/)
    .slice(0, Math.max(0, maxLines))
    .map((line) => line.slice(0, Math.max(0, maxColumns)))
    .join("\n");
}

function buildTokenRunsFromStyledRanges(
  code: string,
  ranges: Array<StyledRange>,
  themeId: WorkspacePassiveCodeThemeId,
): Array<WorkspaceCodeTokenRun> {
  const lineStarts = getLineStarts(code);
  const clampedRanges = ranges
    .map((range) => ({
      from: clampOffset(range.from, code.length),
      to: clampOffset(range.to, code.length),
      styleKey: range.styleKey,
    }))
    .filter((range) => range.from < range.to)
    .sort((left, right) => left.from - right.from || right.to - left.to);
  const runs: Array<WorkspaceCodeTokenRun> = [];
  let cursor = 0;

  for (const range of clampedRanges) {
    if (range.from > cursor) {
      pushTokenRunsForRange({
        code,
        from: cursor,
        to: range.from,
        style: TOKEN_STYLES[themeId].default,
        lineStarts,
        runs,
      });
    }
    const from = Math.max(cursor, range.from);
    if (range.to > from) {
      pushTokenRunsForRange({
        code,
        from,
        to: range.to,
        style: TOKEN_STYLES[themeId][range.styleKey],
        lineStarts,
        runs,
      });
      cursor = Math.max(cursor, range.to);
    }
  }

  if (cursor < code.length) {
    pushTokenRunsForRange({
      code,
      from: cursor,
      to: code.length,
      style: TOKEN_STYLES[themeId].default,
      lineStarts,
      runs,
    });
  }
  return runs.filter((run) => run.text.length > 0);
}

function pushTokenRunsForRange({
  code,
  from,
  to,
  style,
  lineStarts,
  runs,
}: {
  code: string;
  from: number;
  to: number;
  style: HighlightVisualStyle;
  lineStarts: Array<number>;
  runs: Array<WorkspaceCodeTokenRun>;
}) {
  let cursor = from;
  while (cursor < to) {
    if (code[cursor] === "\n") {
      cursor += 1;
      continue;
    }
    const line = lineIndexForOffset(lineStarts, cursor);
    const lineStart = lineStarts[line] ?? 0;
    const nextLineStart = lineStarts[line + 1] ?? code.length + 1;
    const lineEnd = Math.min(to, nextLineStart - 1);
    if (lineEnd > cursor) {
      const run: WorkspaceCodeTokenRun = {
        line,
        fromColumn: cursor - lineStart,
        toColumn: lineEnd - lineStart,
        text: code.slice(cursor, lineEnd),
        color: style.color,
      };
      if (style.fontStyle) {
        run.fontStyle = style.fontStyle;
      }
      if (style.fontWeight) {
        run.fontWeight = style.fontWeight;
      }
      runs.push(run);
    }
    cursor = lineEnd >= to ? to : nextLineStart;
  }
}

function getLineStarts(code: string) {
  const starts = [0];
  for (let idx = 0; idx < code.length; idx += 1) {
    if (code[idx] === "\n") {
      starts.push(idx + 1);
    }
  }
  return starts;
}

function lineIndexForOffset(lineStarts: Array<number>, offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      high = mid - 1;
    } else if (offset >= next) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.max(0, lineStarts.length - 1);
}

function clampOffset(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function resolveHighlightStyleKey(tags: readonly Tag[]): HighlightStyleKey {
  return (
    HIGHLIGHT_STYLE_TAG_RULES.find((rule) =>
      matchesAnyTag(tags, rule.tags),
    )?.styleKey ?? "default"
  );
}

function matchesAnyTag(tags: readonly Tag[], targets: readonly Tag[]) {
  return targets.some((target) => matchesTag(tags, target));
}

function matchesTag(tags: readonly Tag[], target: Tag) {
  return tags.some((tag) => tag.set.includes(target));
}

function normalizeHighlightStyleKey(styleKey: string): HighlightStyleKey {
  return isHighlightStyleKey(styleKey) ? styleKey : "default";
}

function isHighlightStyleKey(value: string): value is HighlightStyleKey {
  return (
    value === "default" ||
    value === "comment" ||
    value === "keyword" ||
    value === "string" ||
    value === "number" ||
    value === "type" ||
    value === "variable" ||
    value === "operator" ||
    value === "invalid"
  );
}
