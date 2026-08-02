/**
 * Model text on plain-text surfaces.
 *
 * The graph's outcome pills and the Director's reply render as plain text, but
 * the model writes markdown, so its emphasis markers arrived verbatim —
 * `**title**` in a pill is formatting displayed as content. This removes the
 * inline markers whose meaning is only emphasis; it deliberately does not
 * attempt markdown rendering, because these surfaces are single-voice lines,
 * not documents.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1");
}
