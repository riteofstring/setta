import { useMarkdown } from "models/panes";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DescriptionWrapper } from "./DescriptionWrapper";

export function SectionDescription({ card = false, descVis = false }) {
  const markdown = useMarkdown((state) => state.data);

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
      className="prose max-w-none px-8 prose-headings:font-heading prose-headings:text-gray-500 prose-p:text-sm "
    >
      {markdownSource}
    </ReactMarkdown>
  );
}
