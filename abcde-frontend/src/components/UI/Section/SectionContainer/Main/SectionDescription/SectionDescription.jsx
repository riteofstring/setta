import { useMarkdown } from "models/markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DescriptionWrapper } from "./DescriptionWrapper";

export function SectionDescription({
  sectionId,
  card = false,
  descVis = false,
}) {
  const markdown = useMarkdown((x) => x.x[sectionId]);

  if (!card) {
    return (
      <DescriptionWrapper descVis={descVis}>
        <Markdown markdownSource={markdown} />
      </DescriptionWrapper>
    );
  }
  return <Markdown markdownSource={markdown} />;
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
