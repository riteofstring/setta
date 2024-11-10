import { MarkdownEditor } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
import "katex/dist/katex.min.css"; // `rehype-katex` does not import the CSS for you
import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import { useIsScrollable } from "state/hooks/sectionSizes";

function _InfoArea({ sectionId }) {
  //TODO change this variable name
  const showYaml = useGetSectionInfo(sectionId, "showYaml");

  return !showYaml ? (
    <Markdown sectionId={sectionId} />
  ) : (
    <MarkdownEditor sectionId={sectionId} />
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
