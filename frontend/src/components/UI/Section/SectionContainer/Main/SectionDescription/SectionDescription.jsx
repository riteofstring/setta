import { useSectionInfos } from "models/info/sectionInfos";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

function _SectionDescription({ sectionId, card = false }) {
  if (!card) {
    return (
      <ResizableDescription sectionId={sectionId}>
        <div className="relative m-8 flex w-min flex-1 flex-col self-stretch overflow-auto [&_.prose]:p-0 [&_pre]:w-full">
          <Markdown sectionId={sectionId} />
        </div>
      </ResizableDescription>
    );
  }
  return (
    <ScrollingArea styles="card-markdown pr-6 pl-2 my-4 nodrag nowheel cursor-auto select-text [&_.prose]:p-0 [&_.prose]flex-1">
      <Markdown sectionId={sectionId} />
    </ScrollingArea>
  );
}

function _Markdown({ sectionId }) {
  const markdownSource = useSectionInfos((x) => x.x[sectionId].description);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose min-w-[100%] [flex:1_1_auto] dark:prose-invert prose-headings:font-heading prose-headings:tracking-tighter prose-headings:text-runcoder-400 prose-p:text-sm [&_*]:[word-wrap:break-word]"
    >
      {markdownSource}
    </ReactMarkdown>
  );
}

export const SectionDescription = React.memo(_SectionDescription);
const Markdown = React.memo(_Markdown);
