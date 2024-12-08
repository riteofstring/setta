import React from "react";

function _IframeArea({ sectionId }) {
  //   const iframeCode = useSectionInfos((x) => x.x[sectionId].iframeCode);
  const iframeCode =
    '<iframe src="http://127.0.0.1:8000/api/docs" width="100%" height="100%" frameborder="0"></iframe>';

  const validationError = validateIframeCode(iframeCode);

  return validationError ? null : (
    <div className="section-w-full section-row-left-bottom flex">
      <div dangerouslySetInnerHTML={{ __html: iframeCode }} />
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
