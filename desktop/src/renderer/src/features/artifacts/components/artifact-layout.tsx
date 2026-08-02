import type { ReactNode } from "react";

import { renderInlineMarkdown } from "@renderer/components/markdown-text";
import { cn } from "@renderer/lib/utils";

import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

/**
 * The artifact document surface.
 *
 * Unframed on purpose: the rail preview card and the artifact reading surface
 * own the frame, so a document nested inside either of them must not add a
 * second one.
 */
export function ArtifactDocument({ children }: { children: ReactNode }) {
  return (
    <div className="setta-artifact flex min-w-0 flex-col gap-[26px] text-[15px] leading-[1.62] select-text">
      {children}
    </div>
  );
}

/**
 * A titled group of blocks.
 *
 * A section is a band, not a heading: a tracked label over a rule, which is how
 * the mockup separates one from a title written inside it. Rendering it as
 * another bold line made every document a flat run of same-weight text.
 */
export function ArtifactSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[14px] border-t border-border pt-[22px]">
      <h2 className="setta-artifact-kicker">{title}</h2>
      {children}
    </section>
  );
}

/*
 * The document's own heading scale, which is not the shell's.
 *
 * The shell is glanced at and sits at 10-13px; a document is read, and a
 * heading inside one has to outrank 15px body text to separate anything. At
 * the shell's 14px it did not, which is what made a document a flat run of
 * near-identical lines.
 */
const headingClasses = {
  section: "text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground",
  subsection: "text-[14px] leading-[1.35] font-semibold text-foreground",
  detail: "setta-artifact-kicker",
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
    <p className={cn("setta-artifact-prose", textToneClasses[tone])}>
      {renderInlineMarkdown(text)}
    </p>
  );
}

const stackGapClasses = {
  compact: "gap-[10px]",
  comfortable: "gap-[22px]",
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
  return (
    <div className={cn("grid gap-x-[34px] gap-y-[24px]", gridColumnsClass(columns))}>
      {children}
    </div>
  );
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
