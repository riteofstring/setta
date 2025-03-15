import { useState } from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { LuBrain } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function ReasoningAccordion({ reasoning }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!reasoning) return null;

  return (
    <div className="mb-2 w-fit max-w-[min(85%,800px)] overflow-hidden rounded-md border border-setta-200 dark:border-setta-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-t-md bg-setta-50 px-3 py-2 text-left text-sm font-medium text-setta-700 hover:bg-setta-100 dark:bg-setta-800/50 dark:text-setta-200 dark:hover:bg-setta-800"
        aria-expanded={isOpen}
        type="button"
      >
        <div className="flex items-center gap-2">
          <LuBrain className="text-blue-500" size={16} />
          <span>Reasoning steps</span>
        </div>
        <div className="ml-2">
          {isOpen ? <HiChevronUp size={16} /> : <HiChevronDown size={16} />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-setta-200 bg-white px-4 py-3 dark:border-setta-700 dark:bg-setta-900/30">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className="prose prose-sm max-w-full text-setta-700 prose-headings:text-setta-800 prose-code:text-blue-600 dark:text-setta-300 dark:prose-headings:text-setta-200 dark:prose-code:text-blue-400"
          >
            {reasoning}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
