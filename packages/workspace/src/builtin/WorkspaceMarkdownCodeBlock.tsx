import { useEffect, useRef, useState } from "react";
import { HiCheck, HiOutlineDuplicate } from "react-icons/hi";
import {
  buildHighlightedCodeLines,
  buildPlainCodeLines,
} from "../controls/text/highlightedCodeLines";
import {
  getThemeScopeClassName,
  mountTextValueThemeStyles,
  useTextValueTheme,
} from "../controls/text/textValueTheme";
import { resolveMarkdownCodeLanguage } from "./markdownCodeLanguages";
import { readFencedCode } from "./markdownHastReaders";

// The reference's fenced-code presentation inside a rendered text block: a bordered, non-prose
// container carrying its copy button over the same idle CodeMirror highlight every other
// committed-code surface in the package paints.
//
// Package-only design decision: the reference resolves fenced from inline code inside its `code`
// component, from the node's start column and whether the text contains a newline, because
// react-markdown stopped passing an `inline` flag. That heuristic misreads a paragraph that
// begins with inline code, which also starts at column 1. The package reads the tree instead:
// `pre` is a fenced or indented block, `code` outside it is inline, and neither guesses.

const COPY_RESET_MS = 2000;

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
    },
    [],
  );

  function showCopied() {
    setCopied(true);
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
  }

  // The same explicit refusal the package's other copy affordance takes: a browser without the
  // API, or one that refuses the write, leaves the button reading "Copy code" rather than
  // reporting a copy that never happened. The reference logs and swallows the rejection; the
  // package has no console channel, so the un-copied label is the report.
  function onCopy() {
    if (!navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(code).then(showCopied, () => {
      setCopied(false);
    });
  }

  return (
    <button
      aria-label={copied ? "Code copied" : "Copy code"}
      className="nodrag absolute end-0 top-0.5 cursor-pointer rounded bg-transparent text-setta-300 opacity-0 transition-opacity duration-200 hover:text-setta-600 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100 dark:hover:text-white"
      data-setta-workspace-touch-target="compact"
      onClick={onCopy}
      type="button"
    >
      {copied ? (
        <HiCheck aria-hidden="true" className="h-4 w-4 text-green-500" />
      ) : (
        <HiOutlineDuplicate aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}

export function WorkspaceMarkdownCodeBlock({ node }: { node?: unknown }) {
  const theme = useTextValueTheme();
  const { code, className } = readFencedCode(node);
  const language = resolveMarkdownCodeLanguage(className);

  useEffect(() => {
    // The idle highlight depends on CodeMirror classes that only mount when a real editor
    // instantiates them, and a rendered text section may be the only editor-bearing surface on
    // the canvas.
    mountTextValueThemeStyles();
  }, []);

  const highlightedLines = buildHighlightedCodeLines(code, theme, language);

  return (
    <div
      className="not-setta-prose group relative my-2 max-w-full overflow-hidden rounded-md border border-setta-200/70 bg-setta-50/70 dark:border-setta-700 dark:bg-setta-900/60"
      data-setta-workspace-code-block="true"
    >
      <CopyCodeButton code={code} />
      <div
        className={`overflow-x-auto px-3 py-2 font-mono text-[length:var(--setta-workspace-text-code-size)] leading-relaxed text-setta-800 dark:text-setta-100 ${
          highlightedLines ? getThemeScopeClassName(theme) : ""
        }`}
      >
        {highlightedLines ?? buildPlainCodeLines(code)}
      </div>
    </div>
  );
}
