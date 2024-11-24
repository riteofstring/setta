import { MarkdownEditorInSection } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
import "katex/dist/katex.min.css"; // `rehype-katex` does not import the CSS for you
import React from "react";
import { HiCheck, HiOutlineDuplicate } from "react-icons/hi"; // Heroicons
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { SECTION_DISPLAY_MODES } from "utils/constants";

function _InfoArea({ sectionId }) {
  //TODO change this variable name
  const displayMode = useGetSectionInfo(sectionId, "displayMode");

  return displayMode === SECTION_DISPLAY_MODES.RENDER ? (
    <Markdown sectionId={sectionId} />
  ) : (
    <MarkdownEditorInSection sectionId={sectionId} />
  );
}

function _Markdown({ sectionId }) {
  const markdownSource = useSectionInfos((x) => x.x[sectionId].description);
  const renderMarkdown = useGetSectionInfo(sectionId, "renderMarkdown");
  const { ref, isScrollable } = useIsScrollable();

  const wrapperClassName = `section-main nodrag ${isScrollable ? "nowheel" : ""} [&_.prose]flex-1 mb-4 ml-2 cursor-auto  select-text overflow-y-scroll [&_.prose]:p-0`;

  return renderMarkdown ? (
    <div ref={ref} className={wrapperClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className="prose-headings: prose prose-sm min-w-[100%] [flex:1_1_auto] dark:prose-invert   prose-headings:tracking-tighter prose-headings:text-setta-400  prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm [&_*]:[word-wrap:break-word]"
        components={{
          code: CodeBlock,
        }}
      >
        {markdownSource}
      </ReactMarkdown>
    </div>
  ) : (
    <pre
      ref={ref}
      className={`${wrapperClassName} w-full overflow-x-clip text-wrap break-words text-xs text-setta-700 dark:text-setta-300`}
    >
      {markdownSource}
    </pre>
  );
}

export const InfoArea = React.memo(_InfoArea);
const Markdown = React.memo(_Markdown);

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef(null);

  // Don't render copy button for inline code
  if (inline) {
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
    <div className="group relative">
      <button
        onClick={handleCopy}
        className="absolute bottom-0 right-0 top-0 cursor-pointer rounded bg-transparent text-setta-300 opacity-0 transition-opacity 
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
    </div>
  );
};
