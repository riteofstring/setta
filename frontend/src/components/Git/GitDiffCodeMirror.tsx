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
import {
  getCodeMirrorLanguageParserForPath,
  type CodeMirrorParserLike,
} from "components/Utils/CodeMirror/codeMirrorLanguages";
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

const DIFF_METADATA_PREFIXES = [
  "index ",
  "new file mode ",
  "deleted file mode ",
  "similarity index ",
  "rename from ",
  "rename to ",
  "\\ No newline at end of file",
] as const;
const DIFF_FILE_PREFIXES = ["+++ ", "--- "] as const;
const MAX_SYNTAX_HIGHLIGHT_DOC_LINES = 12000;
const MAX_SYNTAX_HIGHLIGHT_LINE_LENGTH = 2000;

type DiffLineAnalysis = {
  lineClass: string | null;
  shouldSyntaxHighlight: boolean;
};

type SyntaxDecorationsContext = {
  parser: CodeMirrorParserLike;
  highlighter: Highlighter;
};

const EMPTY_LINE_ANALYSIS: DiffLineAnalysis = {
  lineClass: null,
  shouldSyntaxHighlight: false,
};

function startsWithAny(text: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => text.startsWith(prefix));
}

function isDiffMetadataLine(text: string): boolean {
  return (
    text.startsWith("diff --git") || startsWithAny(text, DIFF_METADATA_PREFIXES)
  );
}

function isDiffFileLine(text: string): boolean {
  return startsWithAny(text, DIFF_FILE_PREFIXES);
}

function isDiffAdditionLine(text: string): boolean {
  return text.startsWith("+") && !text.startsWith("+++");
}

function isDiffDeletionLine(text: string): boolean {
  return text.startsWith("-") && !text.startsWith("---");
}

function analyzeDiffLine(text: string): DiffLineAnalysis {
  if (!text) {
    return EMPTY_LINE_ANALYSIS;
  }
  if (text.startsWith("@@")) {
    return { lineClass: "cm-gitdiff-hunk", shouldSyntaxHighlight: false };
  }
  if (isDiffMetadataLine(text)) {
    return { lineClass: "cm-gitdiff-meta", shouldSyntaxHighlight: false };
  }
  if (isDiffFileLine(text)) {
    return { lineClass: "cm-gitdiff-file", shouldSyntaxHighlight: false };
  }
  if (isDiffAdditionLine(text)) {
    return { lineClass: "cm-gitdiff-add", shouldSyntaxHighlight: true };
  }
  if (isDiffDeletionLine(text)) {
    return { lineClass: "cm-gitdiff-del", shouldSyntaxHighlight: true };
  }
  return {
    lineClass: null,
    shouldSyntaxHighlight: text[0] === " ",
  };
}

function parserForPath(
  path: string | null | undefined,
): CodeMirrorParserLike | null {
  return getCodeMirrorLanguageParserForPath(path);
}

function shouldSyntaxHighlightLine(text: string): boolean {
  return analyzeDiffLine(text).shouldSyntaxHighlight;
}

function createSyntaxDecorationsContext(
  state: EditorState,
  parser: CodeMirrorParserLike | null,
): SyntaxDecorationsContext | null {
  if (parser === null) {
    return null;
  }
  return {
    parser,
    highlighter: {
      style: (tags) => highlightingFor(state, tags),
    },
  };
}

function getReusableSyntaxMarks(
  cache: Map<number, SyntaxLineCacheEntry>,
  lineFrom: number,
  lineText: string,
): Array<[number, number, string]> | null {
  const cached = cache.get(lineFrom);
  if (!cached || cached.text !== lineText) {
    return null;
  }
  cache.delete(lineFrom);
  cache.set(lineFrom, cached);
  return cached.marks;
}

function addSyntaxMarks(
  builder: RangeSetBuilder<Decoration>,
  codeFrom: number,
  marks: Array<[number, number, string]>,
): void {
  for (const [from, to, classes] of marks) {
    builder.add(
      codeFrom + from,
      codeFrom + to,
      Decoration.mark({
        attributes: { class: classes },
      }),
    );
  }
}

function buildSyntaxMarks(
  lineText: string,
  lineFrom: number,
  syntax: SyntaxDecorationsContext,
): Array<[number, number, string]> {
  const marks: Array<[number, number, string]> = [];
  const codeText = lineText.slice(1);
  const tree = syntax.parser.parse(codeText) as never;
  highlightTree(tree, syntax.highlighter, (from, to, classes) => {
    if (!classes) {
      return;
    }
    marks.push([from, to, `cm-gitdiff-syntax ${classes}`]);
  });
  return marks;
}

function decorateSyntaxForLine({
  builder,
  lineText,
  lineFrom,
  syntax,
  cache,
}: {
  builder: RangeSetBuilder<Decoration>;
  lineText: string;
  lineFrom: number;
  syntax: SyntaxDecorationsContext | null;
  cache: Map<number, SyntaxLineCacheEntry>;
}): void {
  if (
    syntax === null ||
    !shouldSyntaxHighlightLine(lineText) ||
    lineText.length <= 1
  ) {
    return;
  }
  const codeText = lineText.slice(1);
  // Guardrail: avoid pathological work on very long lines (minified files, etc).
  if (codeText.length > MAX_SYNTAX_HIGHLIGHT_LINE_LENGTH) {
    return;
  }
  const codeFrom = lineFrom + 1;
  const cachedMarks = getReusableSyntaxMarks(cache, lineFrom, lineText);
  if (cachedMarks !== null) {
    addSyntaxMarks(builder, codeFrom, cachedMarks);
    return;
  }
  const marks = buildSyntaxMarks(lineText, lineFrom, syntax);
  addSyntaxMarks(builder, codeFrom, marks);
  setSyntaxLineCacheEntry(cache, lineFrom, { text: lineText, marks });
}

function decorateVisibleLine({
  builder,
  lineFrom,
  lineText,
  syntax,
  cache,
}: {
  builder: RangeSetBuilder<Decoration>;
  lineFrom: number;
  lineText: string;
  syntax: SyntaxDecorationsContext | null;
  cache: Map<number, SyntaxLineCacheEntry>;
}): void {
  const analysis = analyzeDiffLine(lineText);
  if (analysis.lineClass !== null) {
    builder.add(
      lineFrom,
      lineFrom,
      Decoration.line({ attributes: { class: analysis.lineClass } }),
    );
  }
  if (!analysis.shouldSyntaxHighlight) {
    return;
  }
  decorateSyntaxForLine({
    builder,
    lineText,
    lineFrom,
    syntax,
    cache,
  });
}

function buildCombinedDecorations({
  view,
  syntax,
  cache,
}: {
  view: EditorView;
  syntax: SyntaxDecorationsContext | null;
  cache: Map<number, SyntaxLineCacheEntry>;
}): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const syntaxForView =
    syntax !== null && view.state.doc.lines <= MAX_SYNTAX_HIGHLIGHT_DOC_LINES
      ? syntax
      : null;

  // Build line + syntax decorations in one visible-range pass.
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      decorateVisibleLine({
        builder,
        lineFrom: line.from,
        lineText: line.text,
        syntax: syntaxForView,
        cache,
      });

      pos = line.to + 1;
    }
  }
  return builder.finish();
}

function createDiffDecorationsPlugin(
  parser: CodeMirrorParserLike | null,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      lineCache = new Map<number, SyntaxLineCacheEntry>();

      constructor(view: EditorView) {
        const syntax = createSyntaxDecorationsContext(view.state, parser);
        this.decorations = buildCombinedDecorations({
          view,
          syntax,
          cache: this.lineCache,
        });
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
          const syntax = createSyntaxDecorationsContext(update.state, parser);
          this.decorations = buildCombinedDecorations({
            view: update.view,
            syntax,
            cache: this.lineCache,
          });
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
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
    const diffDecorationsExt = createDiffDecorationsPlugin(parser);

    const ext: Extension[] = [
      DIFF_LINE_THEME,
      diffDecorationsExt,
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
