import { MarkdownEditor } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";

function _InfoArea({ sectionId }) {
  //TODO change this variable name
  const showYaml = useGetSectionInfo(sectionId, "showYaml");

  return !showYaml ? (
    <div className="section-main nodrag nowheel [&_.prose]flex-1 mb-4 ml-2 cursor-auto select-text overflow-y-scroll [&_.prose]:p-0">
      <Markdown sectionId={sectionId} />
    </div>
  ) : (
    <MarkdownEditor
      containerClasses="section-main nowheel [&_.w-md-editor-text_*]:font-code flex flex-1 flex-col items-stretch overflow-y-auto rounded-lg mb-1.5  [&_.w-md-editor-bar]:hidden"
      sectionId={sectionId}
    />
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
