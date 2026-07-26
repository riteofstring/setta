import type { ReactNode } from "react";

import { renderInlineMarkdown } from "@renderer/components/markdown-text";
import { cn } from "@renderer/lib/utils";

import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

/**
 * The artifact document surface.
 *
 * Unframed on purpose: the rail preview card and the artifact browser overlay
 * own the frame, so a document nested inside either of them must not add a
 * second one.
 */
export function ArtifactDocument({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6 text-sm text-foreground select-text">
      {children}
    </div>
  );
}

/** A titled group of blocks. */
export function ArtifactSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base leading-snug font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

const headingClasses = {
  section: "text-base leading-snug font-semibold text-foreground",
  subsection: "text-sm leading-snug font-semibold text-foreground",
  detail: "text-xs leading-snug font-semibold tracking-wide text-muted-foreground uppercase",
} satisfies Record<NonNullable<ArtifactComponentProps["Heading"]["level"]>, string>;

/**
 * A heading inside the document body. The artifact title is rendered by the
 * rail and the browser overlay, so the model's top rank starts one level below
 * it.
 */
export function ArtifactHeading({
  level,
  text,
}: {
  level: NonNullable<ArtifactComponentProps["Heading"]["level"]>;
  text: string;
}) {
  switch (level) {
    case "section":
      return <h2 className={headingClasses.section}>{text}</h2>;
    case "subsection":
      return <h3 className={headingClasses.subsection}>{text}</h3>;
    case "detail":
      return <h4 className={headingClasses.detail}>{text}</h4>;
  }
}

const textToneClasses = {
  normal: "text-foreground",
  muted: "text-muted-foreground",
  strong: "font-medium text-foreground",
} satisfies Record<NonNullable<ArtifactComponentProps["Text"]["tone"]>, string>;

/** A paragraph of plain text. */
export function ArtifactText({
  text,
  tone,
}: {
  text: string;
  tone: NonNullable<ArtifactComponentProps["Text"]["tone"]>;
}) {
  /*
   * Inline markdown, not a raw string. A model writing prose emits `**bold**`
   * whether or not the node it lands in is called Markdown, and rendering the
   * markers literally is what makes generated artifacts look broken.
   */
  return (
    <p className={cn("leading-relaxed text-balance", textToneClasses[tone])}>
      {renderInlineMarkdown(text)}
    </p>
  );
}

const stackGapClasses = {
  compact: "gap-2",
  comfortable: "gap-4",
} satisfies Record<NonNullable<ArtifactComponentProps["Stack"]["gap"]>, string>;

/** Vertically stacked blocks. */
export function ArtifactStack({
  gap,
  children,
}: {
  gap: NonNullable<ArtifactComponentProps["Stack"]["gap"]>;
  children: ReactNode;
}) {
  return <div className={cn("flex flex-col", stackGapClasses[gap])}>{children}</div>;
}

/**
 * Blocks laid out in columns.
 *
 * The column count is the model's, but the breakpoints are not: a narrow
 * Electron window collapses every grid to one column so an artifact never
 * widens the command-center shell.
 */
export function ArtifactGrid({ columns, children }: { columns: number; children: ReactNode }) {
  return <div className={cn("grid gap-4", gridColumnsClass(columns))}>{children}</div>;
}

function gridColumnsClass(columns: number): string {
  switch (columns) {
    case 2:
      return "sm:grid-cols-2";
    case 3:
      return "sm:grid-cols-2 lg:grid-cols-3";
    case 4:
      return "sm:grid-cols-2 lg:grid-cols-4";
    default:
      throw new Error(
        `artifact grid asked for ${columns} columns, which catalog setta.artifacts.v1 does not allow`,
      );
  }
}
