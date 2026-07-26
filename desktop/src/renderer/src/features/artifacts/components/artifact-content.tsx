import { FileIcon } from "lucide-react";

import { MarkdownText } from "@renderer/components/markdown-text";

/**
 * Rich prose.
 *
 * `MarkdownText` renders headings, lists, paragraphs, and inline code from text
 * only — it has no raw-HTML, image, or link path at all — which is the renderer
 * half of the Markdown safety rules the backend enforces before persistence.
 * The backend rejects images, raw HTML, and unsupported link protocols, and an
 * allowed link stays inert text here until a typed host action exists for it.
 */
export function ArtifactMarkdown({ source }: { source: string }) {
  return (
    <div className="[&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_h1]:text-[17px] [&_h1]:font-semibold [&_h2]:text-[17px] [&_h2]:font-semibold [&_h3]:text-[14px] [&_h3]:font-semibold [&_h4]:text-[13px] [&_h4]:font-semibold [&_h5]:text-[13px] [&_h5]:font-semibold [&_ol]:list-decimal [&_ol]:ps-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:ps-5 [&_li[data-task]]:list-none [&_li[data-task]]:-ms-5 [&_li[data-task=true]]:text-muted-foreground [&_.markdown-task-mark]:me-2 [&_.markdown-task-mark]:text-muted-foreground [&>div]:grid [&>div]:gap-[14px] [&>div>*]:m-0">
      <MarkdownText headingLevelOffset={1} text={source} />
    </div>
  );
}

/**
 * A verbatim code or command block.
 *
 * The language is shown rather than highlighted: a highlighter is a dependency
 * the artifact catalog does not need to be readable, and the catalog's language
 * enum is what a later highlighting pass would key off.
 */
export function ArtifactCodeBlock({
  caption,
  code,
  language,
}: {
  caption: string | undefined;
  code: string;
  language: string;
}) {
  return (
    <figure className="setta-artifact-figure flex flex-col gap-[8px]">
      <figcaption className="setta-artifact-faint flex items-baseline justify-between gap-2 text-[12px]">
        {caption === undefined ? <span /> : <span>{caption}</span>}
        <span className="setta-artifact-kicker">{language}</span>
      </figcaption>
      {/*
       * A rule down the leading edge rather than a frame, which is the same
       * treatment a callout gets: the block already reads as verbatim from its
       * monospace and its fill, and the border was the part adding weight
       * without adding meaning.
       */}
      <pre className="overflow-x-auto border-s-2 border-border bg-muted/50 py-[10px] pe-3 ps-[14px] font-mono text-[12.5px] leading-[1.6] text-foreground">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

/**
 * A pointer at one workspace file.
 *
 * The path is inert text. Opening it has to go through a typed Setta action
 * that revalidates the conversation's authorized workspace in the owning
 * process, so the renderer never builds a `file://` URL or resolves the path
 * itself.
 */
export function ArtifactFileReference({
  description,
  path,
}: {
  description: string | undefined;
  path: string;
}) {
  return (
    /*
     * A leading rule, the same mark the code block carries, rather than a rule
     * above. A rule above stacks against whatever rule precedes it — a section
     * band, a title block — and two hairlines a line apart read as a mistake.
     */
    <div className="setta-artifact-figure flex items-start gap-[9px] border-s-2 border-border py-[2px] ps-[14px]">
      <FileIcon aria-hidden className="mt-[3px] size-3.5 shrink-0 text-[var(--director-faint)]" />
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-mono text-[12.5px] break-all text-foreground">{path}</span>
        {description === undefined ? null : (
          <span className="text-[13px] text-muted-foreground">{description}</span>
        )}
      </div>
    </div>
  );
}
