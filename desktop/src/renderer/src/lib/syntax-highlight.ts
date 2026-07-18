import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// Only a curated set of common languages is registered so the renderer bundles
// grammars it actually uses rather than highlight.js's full ~190-language set.
const languages: Record<string, LanguageFn> = {
  bash,
  c,
  cpp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  ruby,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

type LanguageFn = Parameters<typeof hljs.registerLanguage>[1];

// Fence tags map to a registered grammar. Anything not listed here and not a
// registered name falls through to plain text — the highlighter never guesses a
// language, so arbitrary output is never mis-tokenized.
const languageAliases: Record<string, string> = {
  cc: "cpp",
  cjs: "javascript",
  console: "bash",
  "c++": "cpp",
  golang: "go",
  htm: "xml",
  html: "xml",
  js: "javascript",
  jsonc: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  node: "javascript",
  py: "python",
  python3: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  svg: "xml",
  ts: "typescript",
  tsx: "typescript",
  xhtml: "xml",
  yml: "yaml",
  zsh: "bash",
};

let registered = false;

function ensureRegistered() {
  if (registered) {
    return;
  }
  for (const [name, language] of Object.entries(languages)) {
    hljs.registerLanguage(name, language);
  }
  registered = true;
}

function resolveLanguage(language: string | undefined): string | null {
  if (language === undefined) {
    return null;
  }
  const key = language.trim().toLowerCase();
  if (key === "") {
    return null;
  }
  const resolved = languageAliases[key] ?? key;
  return hljs.getLanguage(resolved) !== undefined ? resolved : null;
}

// highlightCode returns highlight.js token HTML for a known language, or null when
// the language is unspecified or unregistered. highlight.js escapes the source, so
// the result is safe to inject. Callers render plain text when this returns null.
export function highlightCode(code: string, language: string | undefined): string | null {
  ensureRegistered();
  const resolved = resolveLanguage(language);
  if (resolved === null) {
    return null;
  }
  try {
    return hljs.highlight(code, { ignoreIllegals: true, language: resolved }).value;
  } catch {
    return null;
  }
}
