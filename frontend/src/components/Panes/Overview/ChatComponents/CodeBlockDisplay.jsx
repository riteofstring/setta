import { useState } from "react";
import {
  HiChevronDown,
  HiChevronUp,
  HiClipboard,
  HiClipboardCheck,
} from "react-icons/hi";

export function CodeBlockDisplay({ children, className, language }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get the code content from children and ensure it's properly processed
  let code = "";
  if (Array.isArray(children)) {
    // Join the array of children to form a single string
    code = children.join("");
  } else if (children) {
    code = children.toString();
  }

  // Trim any extra whitespace that might affect display
  code = code.trim();

  // Handle copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Format displayed language name
  const displayLanguage = language || "plaintext";

  return (
    <div className="relative my-2 w-full max-w-full overflow-hidden rounded-md bg-setta-800 font-mono text-xs dark:bg-setta-950">
      <div className="flex items-center justify-between border-b border-setta-700 bg-setta-900 px-3 py-1.5 text-setta-300">
        <span>{displayLanguage}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-setta-400 hover:text-setta-200"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <HiChevronDown size={16} />
            ) : (
              <HiChevronUp size={16} />
            )}
          </button>

          <button
            onClick={handleCopy}
            className="text-setta-400 hover:text-setta-200"
            title={isCopied ? "Copied!" : "Copy to clipboard"}
          >
            {isCopied ? (
              <HiClipboardCheck size={16} />
            ) : (
              <HiClipboard size={16} />
            )}
          </button>
        </div>
      </div>

      <div
        className={`overflow-x-auto p-3 ${
          isCollapsed ? "max-h-12" : "max-h-96"
        } transition-all duration-300 ease-in-out`}
      >
        <pre className="whitespace-pre-wrap break-words text-setta-100">
          <code>{code}</code>
        </pre>
      </div>

      {isCollapsed && (
        <div className="absolute bottom-0 left-0 right-0 flex h-6 items-center justify-center bg-gradient-to-t from-setta-800 text-xs text-setta-400">
          Code collapsed. Click to expand.
        </div>
      )}
    </div>
  );
}
