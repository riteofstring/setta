import {
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage,
} from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { pythonLanguage } from "@codemirror/lang-python";
import { highlightingFor } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { highlightTree, type Highlighter } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useMemo } from "react";
import {
  setSyntaxLineCacheEntry,
  type SyntaxLineCacheEntry,
} from "./gitDiffSyntaxCache";

const DIFF_LINE_THEME = EditorView.baseTheme({
  ".cm-gitdiff-add": {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  ".cm-gitdiff-del": {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  ".cm-gitdiff-hunk": {
    color: "rgb(37 99 235)",
  },
  ".cm-dark .cm-gitdiff-hunk": {
    color: "rgb(96 165 250)",
  },
  ".cm-gitdiff-file": {
    color: "rgb(100 116 139)",
  },
  ".cm-dark .cm-gitdiff-file": {
    color: "rgb(148 163 184)",
  },
  ".cm-gitdiff-meta": {
    color: "rgb(100 116 139)",
  },
  ".cm-dark .cm-gitdiff-meta": {
    color: "rgb(148 163 184)",
  },
});

function classifyDiffLine(text: string): string | null {
  if (!text) {
    return null;
  }
  if (text.startsWith("@@")) {
    return "cm-gitdiff-hunk";
  }
  if (text.startsWith("diff --git")) {
    return "cm-gitdiff-meta";
  }
  if (
    text.startsWith("index ") ||
    text.startsWith("new file mode ") ||
    text.startsWith("deleted file mode ") ||
    text.startsWith("similarity index ") ||
    text.startsWith("rename from ") ||
    text.startsWith("rename to ") ||
    text.startsWith("\\ No newline at end of file")
  ) {
    return "cm-gitdiff-meta";
  }
  if (text.startsWith("+++ ") || text.startsWith("--- ")) {
    return "cm-gitdiff-file";
  }
  if (text.startsWith("+") && !text.startsWith("+++")) {
    return "cm-gitdiff-add";
  }
  if (text.startsWith("-") && !text.startsWith("---")) {
    return "cm-gitdiff-del";
  }
  return null;
}

function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      const cls = classifyDiffLine(line.text);
      if (cls) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({ attributes: { class: cls } }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const DIFF_LINE_DECORATIONS = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

type ParserLike = {
  parse: (input: string) => unknown;
};

const MAX_SYNTAX_HIGHLIGHT_DOC_LINES = 12000;

function parserForPath(path: string | null | undefined): ParserLike | null {
  if (!path) {
    return null;
  }
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".py")) {
    return pythonLanguage.parser;
  }
  if (normalized.endsWith(".tsx")) {
    return tsxLanguage.parser;
  }
  if (normalized.endsWith(".ts")) {
    return typescriptLanguage.parser;
  }
  if (normalized.endsWith(".jsx")) {
    return jsxLanguage.parser;
  }
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".mjs") ||
    normalized.endsWith(".cjs")
  ) {
    return javascriptLanguage.parser;
  }
  if (normalized.endsWith(".json")) {
    return jsonLanguage.parser;
  }
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return markdownLanguage.parser;
  }
  return null;
}

function shouldSyntaxHighlightLine(text: string): boolean {
  if (!text) {
    return false;
  }
  if (text.startsWith("@@")) {
    return false;
  }
  if (text.startsWith("diff --git")) {
    return false;
  }
  if (
    text.startsWith("index ") ||
    text.startsWith("new file mode ") ||
    text.startsWith("deleted file mode ") ||
    text.startsWith("similarity index ") ||
    text.startsWith("rename from ") ||
    text.startsWith("rename to ") ||
    text.startsWith("\\ No newline at end of file")
  ) {
    return false;
  }
  if (text.startsWith("+++ ") || text.startsWith("--- ")) {
    return false;
  }
  const first = text[0];
  return (
    first === " " ||
    (first === "+" && !text.startsWith("+++")) ||
    (first === "-" && !text.startsWith("---"))
  );
}

function buildSyntaxDecorations(
  view: EditorView,
  parser: ParserLike,
  highlighter: Highlighter,
  cache: Map<number, SyntaxLineCacheEntry>,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  if (view.state.doc.lines > MAX_SYNTAX_HIGHLIGHT_DOC_LINES) {
    return builder.finish();
  }
  // Highlight only visible lines; keep per-line results cached for scroll perf.
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      if (!shouldSyntaxHighlightLine(lineText)) {
        pos = line.to + 1;
        continue;
      }
      if (lineText.length <= 1) {
        pos = line.to + 1;
        continue;
      }
      const codeText = lineText.slice(1);
      // Guardrail: avoid pathological work on very long lines (minified files, etc).
      if (codeText.length > 2000) {
        pos = line.to + 1;
        continue;
      }
      const codeFrom = line.from + 1;
      const cached = cache.get(line.from);
      if (cached && cached.text === lineText) {
        cache.delete(line.from);
        cache.set(line.from, cached);
        for (const [from, to, classes] of cached.marks) {
          builder.add(
            codeFrom + from,
            codeFrom + to,
            Decoration.mark({
              attributes: { class: classes },
            }),
          );
        }
      } else {
        const marks: Array<[number, number, string]> = [];
        const tree = parser.parse(codeText) as never;
        highlightTree(tree, highlighter, (from, to, classes) => {
          if (!classes) {
            return;
          }
          const className = `cm-gitdiff-syntax ${classes}`;
          marks.push([from, to, className]);
          builder.add(
            codeFrom + from,
            codeFrom + to,
            Decoration.mark({
              attributes: { class: className },
            }),
          );
        });
        setSyntaxLineCacheEntry(cache, line.from, { text: lineText, marks });
      }

      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export function GitDiffCodeMirror({
  value,
  filePathForLanguage,
  className,
  wrapLines = false,
  height,
}: {
  value: string;
  filePathForLanguage?: string | null;
  className?: string;
  wrapLines?: boolean;
  height?: string;
}) {
  const theme = useCodeMirrorStyle();

  const extensions: Extension[] = useMemo(() => {
    const parser = parserForPath(filePathForLanguage);
    const syntaxDecorationsExt = parser
      ? ViewPlugin.fromClass(
          class {
            decorations: DecorationSet;
            lineCache = new Map<number, SyntaxLineCacheEntry>();

            constructor(view: EditorView) {
              const highlighter: Highlighter = {
                style: (tags) => highlightingFor(view.state, tags),
              };
              this.decorations = buildSyntaxDecorations(
                view,
                parser,
                highlighter,
                this.lineCache,
              );
            }

            update(update: ViewUpdate) {
              if (
                update.docChanged ||
                update.viewportChanged ||
                update.reconfigured
              ) {
                if (update.docChanged || update.reconfigured) {
                  this.lineCache.clear();
                }
                const highlighter: Highlighter = {
                  style: (tags) => highlightingFor(update.state, tags),
                };
                this.decorations = buildSyntaxDecorations(
                  update.view,
                  parser,
                  highlighter,
                  this.lineCache,
                );
              }
            }
          },
          {
            decorations: (v) => v.decorations,
          },
        )
      : null;

    const ext: Extension[] = [
      DIFF_LINE_THEME,
      DIFF_LINE_DECORATIONS,
      ...(syntaxDecorationsExt ? [syntaxDecorationsExt] : []),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    if (wrapLines) {
      ext.push(EditorView.lineWrapping);
    }
    return ext;
  }, [filePathForLanguage, wrapLines]);

  return (
    <CodeMirror
      className={className}
      value={value}
      height={height}
      theme={theme}
      extensions={extensions}
      indentWithTab={false}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        tabSize: 4,
        drawSelection: false,
      }}
    />
  );
}
