import { useEffect, useRef, useState } from "react";
import { HiCheck, HiOutlineDuplicate } from "react-icons/hi";
import {
  buildHighlightedCodeLines,
  buildPlainCodeLines,
} from "../controls/text/highlightedCodeLines.js";
import {
  getThemeScopeClassName,
  mountTextValueThemeStyles,
  useTextValueTheme,
} from "../controls/text/textValueTheme.js";
import { resolveMarkdownCodeLanguage } from "./markdownCodeLanguages.js";
import { readFencedCode } from "./markdownHastReaders.js";

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
