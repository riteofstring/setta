import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function SectionDescription() {
  const markdownSource = `## The Future of AI and Data Science 
  Lets get something straight here, [I'm](#) going to type some markdown.
  * [x] azeazea

| Feature    | Support              |
| ---------- | -------------------- |
| CommonMark | 100%                 |
| GFM        | 100%                 |
  `;

  return (
    <div className="section-description mb-3 rounded-3xl py-5 shadow-xl transition-all hover:bg-gray-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className="prose max-w-none px-8 prose-headings:font-heading prose-headings:text-gray-500 prose-p:text-sm "
      >
        {markdownSource}
      </ReactMarkdown>
    </div>
  );
}
