import React, { useEffect, useRef } from "react";
import { getCurrIFrameSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";

function _IframeArea({ sectionId }: { sectionId: string }) {
  const code = useProjectState(
    (state) => getCurrIFrameSectionImpl(state, sectionId).code,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // If there's an iframe in the sanitized content, update its dimensions
        const iframeElement =
          container.querySelector<HTMLIFrameElement>("iframe");
        if (iframeElement) {
          iframeElement.style.width = `${width}px`;
          iframeElement.style.height = `${height}px`;
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [code]);

  return !code || validateIframeCode(code) ? null : (
    <div
      className="section-main mb-2 mt-1.5 overflow-clip rounded-md"
      data-gpu-flow-control={`iframe:${sectionId}`}
      ref={containerRef}
    >
      <div dangerouslySetInnerHTML={{ __html: code }} />
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
