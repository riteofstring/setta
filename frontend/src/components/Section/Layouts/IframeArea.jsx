import React, { useEffect, useRef } from "react";
import { useSectionInfos } from "state/definitions";

function _IframeArea({ sectionId, scale = 0.5 }) {
  const iframeCode = useSectionInfos((x) => x.x[sectionId].iframeCode);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateIframe = (entries) => {
      for (const entry of entries) {
        const iframeElement = containerRef.current.querySelector("iframe");
        if (iframeElement) {
          // First set the iframe to match container size
          iframeElement.style.width = "200%";
          iframeElement.style.height = "200%";

          // Apply scaling transform
          iframeElement.style.transform = `scale(${scale})`;
        //   iframeElement.style.transformOrigin = "top left";
        }
      }
    };

    const resizeObserver = new ResizeObserver(updateIframe);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [iframeCode, scale]);

  if (!iframeCode) return null;

  return (
    <div className="section-full-no-title" ref={containerRef}>
      <div
        className="h-full w-full"
        dangerouslySetInnerHTML={{ __html: iframeCode }}
      />
    </div>
  );
}

export const IframeArea = React.memo(_IframeArea);

// Basic security check for iframe code
const validateIframeCode = (code) => {
  // Check if it contains an iframe tag
  if (!code.toLowerCase().includes("<iframe")) {
    return "Input must contain an iframe tag";
  }

  // Check for potentially dangerous attributes
  const dangerousAttrs = [
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "javascript:",
  ];
  if (dangerousAttrs.some((attr) => code.toLowerCase().includes(attr))) {
    return "Script events are not allowed in iframe code";
  }

  return "";
};
