import { MarkdownEditorInSection } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import "katex/dist/katex.min.css"; // `rehype-katex` does not import the CSS for you
import _ from "lodash";
import React from "react";
import { HiCheck, HiOutlineDuplicate } from "react-icons/hi"; // Heroicons
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { getTextBlockText } from "state/hooks/sectionVariants";
import type { CodeLanguage } from "utils/codeLanguage";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { buildTextBlockTypographyScale } from "utils/textBlockTypography";

const INLINE_CODE_CLASS_NAME =
  "rounded-sm bg-setta-200/70 px-1 py-[1px] font-mono text-[0.92em] text-setta-800 dark:bg-setta-700 dark:text-setta-100";

type MarkdownCodeLanguage = {
  language: CodeLanguage | null;
  useJsx: boolean;
};

const MARKDOWN_CODE_LANGUAGE_BY_ALIAS: Record<string, MarkdownCodeLanguage> = {
  bash: { language: CodeLanguageEnum.bash, useJsx: false },
  cjs: { language: CodeLanguageEnum.javascript, useJsx: false },
  js: { language: CodeLanguageEnum.javascript, useJsx: false },
  json: { language: CodeLanguageEnum.json, useJsx: false },
  jsx: { language: CodeLanguageEnum.javascript, useJsx: true },
  markdown: { language: CodeLanguageEnum.markdown, useJsx: false },
  md: { language: CodeLanguageEnum.markdown, useJsx: false },
  plaintext: { language: CodeLanguageEnum.plaintext, useJsx: false },
  py: { language: CodeLanguageEnum.python, useJsx: false },
  python: { language: CodeLanguageEnum.python, useJsx: false },
  sh: { language: CodeLanguageEnum.bash, useJsx: false },
  shell: { language: CodeLanguageEnum.bash, useJsx: false },
  text: { language: CodeLanguageEnum.plaintext, useJsx: false },
  toml: { language: CodeLanguageEnum.toml, useJsx: false },
  ts: { language: CodeLanguageEnum.typescript, useJsx: false },
  tsx: { language: CodeLanguageEnum.typescript, useJsx: true },
  yaml: { language: CodeLanguageEnum.yaml, useJsx: false },
  yml: { language: CodeLanguageEnum.yaml, useJsx: false },
  zsh: { language: CodeLanguageEnum.bash, useJsx: false },
};

function resolveMarkdownCodeLanguage(
  className: string | undefined,
): MarkdownCodeLanguage {
  if (!className) {
    return { language: null, useJsx: false };
  }
  const match = /\blanguage-([a-z0-9_+-]+)\b/iu.exec(className);
  if (!match || !match[1]) {
    return { language: null, useJsx: false };
  }
  return (
    MARKDOWN_CODE_LANGUAGE_BY_ALIAS[match[1].toLowerCase()] ?? {
      language: null,
      useJsx: false,
    }
  );
}

function stringifyCodeChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return "";
    })
    .join("");
}

function stripLanguageClass(className: string | undefined): string {
  if (!className) {
    return "";
  }
  return className.replace(/\blanguage-[a-z0-9_+-]+\b/giu, "").trim();
}

function joinClassNames(parts: Array<string>): string {
  return parts.filter((part) => part.length > 0).join(" ");
}

export function MarkdownCodePre({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function _TextBlock({ sectionId }) {
  const textDisplayMode = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return impl.textDisplayMode;
  });

  return textDisplayMode === TextBlockDisplayModeEnum.Render ? (
    <Markdown sectionId={sectionId} />
  ) : (
    <MarkdownEditorInSection sectionId={sectionId} />
  );
}

function _Markdown({ sectionId }) {
  const { format, text, metaControlStyle, masterFontSizePx } = useProjectState(
    (x) => getTextBlockText(sectionId, x),
    _.isEqual,
  );
  const typography = React.useMemo(
    () => buildTextBlockTypographyScale(masterFontSizePx),
    [masterFontSizePx],
  );
  const markdownTypographyStyle: React.CSSProperties = {
    "--setta-textblock-body-size": `${typography.bodyPx}px`,
    "--setta-textblock-code-size": `${typography.codePx}px`,
    "--setta-textblock-h1-size": `${typography.h1Px}px`,
    "--setta-textblock-h2-size": `${typography.h2Px}px`,
    "--setta-textblock-h3-size": `${typography.h3Px}px`,
    "--setta-textblock-h4-size": `${typography.h4Px}px`,
    "--setta-textblock-h5-size": `${typography.h5Px}px`,
    "--setta-textblock-h6-size": `${typography.h6Px}px`,
  };

  const { ref, isScrollable } = useIsScrollable();

  const wrapperClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-main -mt-1  nodrag ${isScrollable ? "nowheel" : ""} -mr-[13px] pr-4 mb-3 ml-1 cursor-auto select-text overflow-y-scroll [&_.prose]:p-0`;
  const proseContrastClassName = metaControlStyle
    ? "prose-headings:text-setta-750 dark:prose-headings:text-setta-150 prose-p:text-setta-850 dark:prose-p:text-setta-50"
    : "prose-headings:text-setta-400";
  const preTextClassName = metaControlStyle
    ? "text-setta-850 dark:text-setta-50"
    : "text-setta-700 dark:text-setta-300";

  // the classes "prose-code:before:hidden prose-code:after:hidden" are needed to prevent backticks from appearing
  // https://github.com/tailwindlabs/tailwindcss-typography/issues/18#issuecomment-1280797041
  return format === TextBlockFormatEnum.Markdown ? (
    <div ref={ref} className={wrapperClassName} style={markdownTypographyStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className={`prose-headings: prose min-w-[100%] [flex:1_1_auto] dark:prose-invert prose-headings:tracking-tighter ${proseContrastClassName} prose-h1:text-[length:var(--setta-textblock-h1-size)] prose-h2:text-[length:var(--setta-textblock-h2-size)] prose-h3:text-[length:var(--setta-textblock-h3-size)] prose-h4:text-[length:var(--setta-textblock-h4-size)] prose-h5:text-[length:var(--setta-textblock-h5-size)] prose-h6:text-[length:var(--setta-textblock-h6-size)] prose-p:text-[length:var(--setta-textblock-body-size)] prose-code:text-[length:var(--setta-textblock-code-size)] prose-code:before:hidden prose-code:after:hidden prose-pre:text-[length:var(--setta-textblock-code-size)] prose-li:text-[length:var(--setta-textblock-body-size)] [&_*]:[word-wrap:break-word]`}
        components={{
          code: CodeBlock,
          pre: MarkdownCodePre,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  ) : (
    <pre
      ref={ref}
      className={`${wrapperClassName} overflow-x-clip text-wrap break-words ${preTextClassName}`}
      style={{ fontSize: `${typography.bodyPx}px` }}
    >
      {text}
    </pre>
  );
}

export const TextBlock = React.memo(_TextBlock);
const Markdown = React.memo(_Markdown);

type CodeBlockProps = React.HTMLAttributes<HTMLElement> & {
  node?: {
    position?: {
      start?: {
        column?: number;
      };
    };
  };
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export const CodeBlock = ({
  node,
  inline,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const [copied, setCopied] = React.useState(false);
  const codeMirrorTheme = useCodeMirrorStyle();
  const codeText = React.useMemo(
    () => stringifyCodeChildren(children),
    [children],
  );
  const hasLanguageClass = /\blanguage-[a-z0-9_+-]+\b/iu.test(className ?? "");
  const startsAtColumnOne = node?.position?.start?.column === 1;
  const containsLineBreak = codeText.includes("\n");
  const isBlockCode =
    inline === false ||
    (inline === undefined &&
      (hasLanguageClass || startsAtColumnOne || containsLineBreak));
  const { language, useJsx } = React.useMemo(
    () => resolveMarkdownCodeLanguage(className),
    [className],
  );
  const normalizedClassName = stripLanguageClass(className);

  if (!isBlockCode) {
    return (
      <code
        data-setta-inline-code="true"
        className={joinClassNames([
          INLINE_CODE_CLASS_NAME,
          normalizedClassName,
        ])}
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  return (
    <div
      data-setta-code-block="true"
      className="not-prose group relative my-2 overflow-hidden rounded-md border border-setta-200/70 bg-setta-50/70 dark:border-setta-700 dark:bg-setta-900/60"
    >
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-0 top-0.5 cursor-pointer rounded bg-transparent text-setta-300 opacity-0 transition-opacity 
                   duration-200 hover:text-setta-600 focus:outline-none
                   focus:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100 dark:hover:text-white"
        aria-label="Copy code"
      >
        {copied ? (
          <HiCheck className="h-4 w-4 text-green-500" />
        ) : (
          <HiOutlineDuplicate className="h-4 w-4" />
        )}
      </button>

      <DummyCodeMirror
        code={codeText}
        theme={codeMirrorTheme}
        className={joinClassNames([
          "overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-setta-800 dark:text-setta-100",
          normalizedClassName,
        ])}
        language={language}
        useJsx={useJsx}
        wrapLines={false}
      />
    </div>
  );
};
