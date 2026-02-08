import type { Extension } from "@codemirror/state";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useMemo } from "react";

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

export function GitDiffCodeMirror({
  value,
  className,
  wrapLines = false,
  height,
}: {
  value: string;
  className?: string;
  wrapLines?: boolean;
  height?: string;
}) {
  const theme = useCodeMirrorStyle();

  const extensions: Extension[] = useMemo(() => {
    const ext: Extension[] = [
      DIFF_LINE_THEME,
      DIFF_LINE_DECORATIONS,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    if (wrapLines) {
      ext.push(EditorView.lineWrapping);
    }
    return ext;
  }, [wrapLines]);

  return (
    <CodeMirror
      className={className}
      value={value}
      height={height}
      theme={theme}
      extensions={extensions}
      onChange={() => {}}
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
