import type { WorkspaceEditorLanguage } from "../controls/text/editorLanguages";

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
