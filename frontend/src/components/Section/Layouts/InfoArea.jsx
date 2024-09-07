import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSectionInfos } from "state/definitions";

function _InfoArea({ sectionId }) {
  return (
    <div className="section-main nodrag nowheel [&_.prose]flex-1 my-4 ml-2 cursor-auto select-text overflow-y-scroll [&_.prose]:p-0">
      <Markdown sectionId={sectionId} />
    </div>
  );
}

function _Markdown({ sectionId }) {
  const markdownSource = useSectionInfos((x) => x.x[sectionId].description);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose prose-sm min-w-[100%] [flex:1_1_auto] dark:prose-invert prose-headings:font-heading   prose-headings:tracking-tighter prose-headings:text-setta-400  prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm [&_*]:[word-wrap:break-word]"
    >
      {markdownSource}
    </ReactMarkdown>
  );
}

export const InfoArea = React.memo(_InfoArea);
const Markdown = React.memo(_Markdown);
