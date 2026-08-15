import type { HTMLAttributes } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { WorkspaceMarkdownCodeBlock } from "./WorkspaceMarkdownCodeBlock";

// The reference's rendered Markdown surface: GitHub-flavored Markdown (tables, task lists,
// strikethrough, autolinks) plus math through KaTeX, with raw HTML left disabled because
// react-markdown parses none unless a host adds `rehype-raw`, which this package never does.
//
// `rehype-katex` renders markup KaTeX's own stylesheet is required to lay out. The reference
// imports that stylesheet from the component; this package folds it, scoped and with its faces
// inlined, into the one compiled stylesheet it ships (scripts/compile-katex-styles.mjs), so this
// module imports no CSS and a consumer resolves no dependency stylesheet or font.
//
// Package-only design decision: the Tailwind typography plugin is compiled under the package's
// own `setta-prose` class name rather than the plugin's default `prose`, so the compiled
// stylesheet cannot redefine a host's own typography classes.

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

// The reference's `INLINE_CODE_CLASS_NAME`.
const INLINE_CODE_CLASS_NAME =
  "rounded-sm bg-setta-200/70 px-1 py-[1px] font-mono text-[0.92em] text-setta-800 dark:bg-setta-700 dark:text-setta-100";

// The reference's rendered typography, over the authored scale's custom properties. The
// `setta-prose-code:before/after:hidden` pair is the documented way to stop the plugin adding
// literal backticks around inline code.
const MARKDOWN_CLASS_NAME = [
  "setta-prose min-w-[100%] [flex:1_1_auto] dark:setta-prose-invert",
  "setta-prose-headings:tracking-tighter setta-prose-headings:text-setta-400",
  "setta-prose-h1:text-[length:var(--setta-workspace-text-h1-size)]",
  "setta-prose-h2:text-[length:var(--setta-workspace-text-h2-size)]",
  "setta-prose-h3:text-[length:var(--setta-workspace-text-h3-size)]",
  "setta-prose-h4:text-[length:var(--setta-workspace-text-h4-size)]",
  "setta-prose-h5:text-[length:var(--setta-workspace-text-h5-size)]",
  "setta-prose-h6:text-[length:var(--setta-workspace-text-h6-size)]",
  "setta-prose-p:text-[length:var(--setta-workspace-text-body-size)]",
  "setta-prose-li:text-[length:var(--setta-workspace-text-body-size)]",
  "setta-prose-code:text-[length:var(--setta-workspace-text-code-size)]",
  "setta-prose-code:before:hidden setta-prose-code:after:hidden",
  "setta-prose-pre:text-[length:var(--setta-workspace-text-code-size)]",
  "[&_*]:[word-wrap:break-word]",
].join(" ");

// Only code outside a `pre` reaches here, so this is the reference's inline chip and nothing
// else has to be decided.
function MarkdownInlineCode({ children, ...codeProps }: HTMLAttributes<HTMLElement>) {
  return (
    <code {...codeProps} className={INLINE_CODE_CLASS_NAME} data-setta-inline-code="true">
      {children}
    </code>
  );
}

const MARKDOWN_COMPONENTS = {
  code: MarkdownInlineCode,
  pre: WorkspaceMarkdownCodeBlock,
};

export function WorkspaceMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      className={MARKDOWN_CLASS_NAME}
      components={MARKDOWN_COMPONENTS}
      rehypePlugins={REHYPE_PLUGINS}
      remarkPlugins={REMARK_PLUGINS}
    >
      {text}
    </Markdown>
  );
}
