import { useSectionInfos } from "models/info/sectionInfos";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function SectionDescription({ sectionId, width, card = false }) {
  const description = useSectionInfos((x) => x.x[sectionId].description);

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
    <ScrollingArea rootStyle="flex-1 self-stretch nodrag nowheel mx-8 my-6 cursor-auto select-text px-3 [&_.prose]:p-0 [&_.prose]flex-1">
      <Markdown markdownSource={description} />
    </ScrollingArea>
  );
}

function Markdown({ markdownSource }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose w-full px-8 [flex:1_1_auto] prose-headings:font-heading prose-headings:tracking-tighter prose-headings:text-slate-500 prose-p:text-sm [&_*]:[word-wrap:break-word]"
    >
      {markdownSource}
    </ReactMarkdown>
  );
}
