import { useEffect, useRef, useState } from "react";
import { useCodeInput } from "utils/CodeInput/CodeInput";

export function Settings() {
  useCodeInput();
  return (
    // <>
    <code-input language="HTML" placeholder="Type code here"></code-input>
    // </>
  );
}

const HighlightTextarea = () => {
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef(null);
  const mirrorDivRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const syncScroll = () => {
      if (mirrorDivRef.current) {
        mirrorDivRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    };

    const textarea = textareaRef.current;
    textarea.addEventListener("scroll", syncScroll);

    return () => textarea.removeEventListener("scroll", syncScroll);
  }, []);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const highlightKeywords = (text) => {
    const keywords = ["dog"];
    let highlightedText = text
      .split("\n")
      .map((line) => {
        let processedLine = line;
        keywords.forEach((keyword) => {
          const regex = new RegExp(`(${keyword})`, "gi");
          processedLine = processedLine.replace(
            regex,
            `<span class="text-red-500">$1</span>`,
          );
        });
        return processedLine;
      })
      .join("<br>"); // Replace new lines with <br> to ensure line breaks are visualized.

    return highlightedText;
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        ref={mirrorDivRef}
        className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-hidden p-3"
        style={{
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          color: "transparent",
          font: "inherit", // Ensure font consistency
          lineHeight: "inherit", // Ensure line height consistency
        }}
        dangerouslySetInnerHTML={{ __html: highlightKeywords(inputValue) }}
      />
      <textarea
        ref={textareaRef}
        className="h-full w-full resize-none border border-gray-300 bg-transparent p-3"
        value={inputValue}
        onChange={handleInputChange}
        style={{
          font: "inherit",
          wordBreak: "break-word",
          lineHeight: "inherit", // Match line height with the mirror div
        }}
      />
    </div>
  );
};

export default HighlightTextarea;
