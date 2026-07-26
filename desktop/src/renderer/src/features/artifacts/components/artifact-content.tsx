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
    <div className="[&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_h4]:text-xs [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:ps-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:ps-5 [&>div]:grid [&>div]:gap-2 [&>div>*]:m-0">
      <MarkdownText text={source} />
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
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        {caption === undefined ? <span /> : <span>{caption}</span>}
        <span className="font-mono text-[0.7rem] tracking-wide uppercase">{language}</span>
      </figcaption>
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
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
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
      <FileIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-xs break-all text-foreground">{path}</span>
        {description === undefined ? null : (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </div>
  );
}
