import { useSectionDescription } from "models/info/sectionDescription";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function SectionDescription({ sectionId, card = false }) {
  const description = useSectionDescription((x) => x.x[sectionId].value);

  if (!card) {
    return (
      <ResizableDescription sectionId={sectionId}>
        <div className="relative m-8 flex w-min flex-1 flex-col self-stretch overflow-y-scroll [&_.prose]:p-0 [&_pre]:absolute [&_pre]:w-full ">
          <Markdown markdownSource={description} />
        </div>
      </ResizableDescription>
    );
  }
  return (
    <div className="nodrag nowheel mx-8 my-6 flex-1 cursor-auto select-text self-stretch overflow-y-scroll px-3 [&_.prose]:p-0">
      <Markdown markdownSource={description} />
    </div>
  );
}

function Markdown({ markdownSource }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose max-w-none px-8 [flex:1_1_auto] prose-headings:font-heading prose-headings:text-slate-500 prose-p:text-sm "
    >
      {markdownSource}
    </ReactMarkdown>
  );
}
