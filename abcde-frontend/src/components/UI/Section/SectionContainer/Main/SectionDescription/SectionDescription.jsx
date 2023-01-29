import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DescriptionWrapper } from "./DescriptionWrapper";

export function SectionDescription({ card = false, descVis = false }) {
  const markdownSource = `## The Future of AI and Data Science 
  Lets get something straight here, [I'm](#) going to type some markdown.
  * [x] azeazea

| Feature    | Support              |
| ---------- | -------------------- |
| CommonMark | 100%                 |
| GFM        | 100%                 |
  `;

  if (card) {
    return (
      <DescriptionWrapper descVis={descVis}>
        <Markdown markdownSource={markdownSource} />
      </DescriptionWrapper>
    );
  }
  return <Markdown markdownSource={markdownSource} />;
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
