import { useGetSectionDescription } from "hooks/useSectionDescription";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function SectionDescription({ sectionId, width, card = false }) {
  const description = useGetSectionDescription(sectionId, "value");

  if (!card) {
    return (
      <ResizableDescription sectionId={sectionId} width={width}>
        <div className="relative m-8 flex w-min flex-1 flex-col self-stretch overflow-auto [&_.prose]:p-0 [&_pre]:w-full">
          <Markdown markdownSource={description} />
        </div>
      </ResizableDescription>
    );
  }
  return (
    <div className="nodrag nowheel mx-8 my-6 flex-1 cursor-auto select-text self-stretch overflow-auto px-3 [&_.prose]:p-0">
      <Markdown markdownSource={description} />
    </div>
  );
}

function Markdown({ markdownSource }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose max-w-none px-8 [flex:1_1_auto] prose-headings:font-heading prose-headings:text-slate-500 prose-p:text-sm [&_*]:[word-wrap:break-word]"
    >
      {markdownSource}
    </ReactMarkdown>
  );
}
