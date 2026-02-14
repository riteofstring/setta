import { MarkdownEditorInSection } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
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
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import { buildTextBlockTypographyScale } from "utils/textBlockTypography";
import {
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";

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
        className={`prose-headings: prose min-w-[100%] [flex:1_1_auto] dark:prose-invert prose-headings:tracking-tighter ${proseContrastClassName} prose-code:before:hidden prose-code:after:hidden prose-p:text-[length:var(--setta-textblock-body-size)] prose-li:text-[length:var(--setta-textblock-body-size)] prose-code:text-[length:var(--setta-textblock-code-size)] prose-pre:text-[length:var(--setta-textblock-code-size)] prose-h1:text-[length:var(--setta-textblock-h1-size)] prose-h2:text-[length:var(--setta-textblock-h2-size)] prose-h3:text-[length:var(--setta-textblock-h3-size)] prose-h4:text-[length:var(--setta-textblock-h4-size)] prose-h5:text-[length:var(--setta-textblock-h5-size)] prose-h6:text-[length:var(--setta-textblock-h6-size)] [&_*]:[word-wrap:break-word]`}
        components={{
          code: CodeBlock,
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

export const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef(null);

  // Check if this is a block-level code element (triple backticks)
  const isBlockCode =
    node?.tagName === "code" && node?.position?.start?.column === 1;

  // Don't render copy button for inline code
  if (!isBlockCode) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    if (codeRef.current) {
      const text = codeRef.current.textContent;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy text:", err);
      }
    }
  };

  return (
    <span className="group relative block">
      <button
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
      <code ref={codeRef} className={`${className}`} {...props}>
        {children}
      </code>
    </span>
  );
};
