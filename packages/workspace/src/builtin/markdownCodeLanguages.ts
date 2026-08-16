import type { WorkspaceEditorLanguage } from "../controls/text/textValueLanguages";

// The reference's `MARKDOWN_CODE_LANGUAGE_BY_ALIAS`: the fence infostrings a Markdown author
// writes, mapped onto the package's editor language set. Package-only design decision: the
// reference resolves `jsx`/`tsx` to a JSX parser variant, which the package's language registry
// deliberately does not carry (its editors receive one declared language), so those fences
// highlight through the plain JavaScript and TypeScript packs.
const MARKDOWN_CODE_LANGUAGE_BY_ALIAS: Record<
  string,
  WorkspaceEditorLanguage | null
> = {
  bash: "bash",
  cjs: "javascript",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  markdown: "markdown",
  md: "markdown",
  plaintext: null,
  py: "python",
  python: "python",
  sh: "bash",
  shell: "bash",
  text: null,
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

// The reference's `resolveMarkdownCodeLanguage`. An unlisted or absent infostring is not an
// error: a fence may legitimately carry a language the package does not highlight, and the block
// still renders as code.
export function resolveMarkdownCodeLanguage(
  className: string | undefined,
): WorkspaceEditorLanguage | null {
  if (!className) {
    return null;
  }
  const match = /\blanguage-([a-z0-9_+-]+)\b/iu.exec(className);
  const alias = match?.[1];
  if (!alias) {
    return null;
  }
  return MARKDOWN_CODE_LANGUAGE_BY_ALIAS[alias.toLowerCase()] ?? null;
}
