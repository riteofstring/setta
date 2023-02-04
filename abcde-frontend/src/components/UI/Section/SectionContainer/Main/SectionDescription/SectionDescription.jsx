import { useSectionDescription } from "models/info/sectionDescription";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DescriptionWrapper } from "./DescriptionWrapper";

export function SectionDescription({
  sectionId,
  card = false,
  descVis = false,
}) {
  const description = useSectionDescription((x) => x.x[sectionId].value);

  if (!card) {
    return (
      <DescriptionWrapper sectionId={sectionId} descVis={descVis}>
        <Markdown markdownSource={description} />
      </DescriptionWrapper>
    );
  }
  return <Markdown markdownSource={description} />;
}

function Markdown({ markdownSource }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose px-8 prose-headings:font-heading prose-headings:text-slate-500 prose-p:text-sm "
    >
      {markdownSource}
    </ReactMarkdown>
  );
}
