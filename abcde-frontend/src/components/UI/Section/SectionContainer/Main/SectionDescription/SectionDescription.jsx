import { useSectionDescription } from "models/info/sectionDescription";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DescriptionWrapper } from "./DescriptionWrapper";

export function SectionDescription({ sectionId, card = false }) {
  const description = useSectionDescription((x) => x.x[sectionId].value);

  if (!card) {
    return (
      <DescriptionWrapper sectionId={sectionId}>
        <Markdown markdownSource={description} />
      </DescriptionWrapper>
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
      className="prose max-w-none px-8 prose-headings:font-heading prose-headings:text-slate-500 prose-p:text-sm [&_pre]:absolute  [&_pre]:[width:calc(100%_-_4rem)]"
    >
      {markdownSource}
    </ReactMarkdown>
  );
}
