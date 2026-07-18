export const languageCountArtifactArguments = {
  columns: [
    { key: "language", label: "Language" },
    { key: "lines", label: "Lines" },
  ],
  kind: "table",
  rows: [
    ["Go", "34"],
    ["TypeScript", "21"],
    ["CSS", "8"],
  ],
  title: "Language line counts",
};

export function validateArtifactToolResult(requestId, result) {
  const item = validToolCallTextItem(result);
  if (!item) {
    throw new Error(`artifact tool ${requestId} returned malformed result`);
  }
  const acknowledgement = JSON.parse(item.text);
  if (validArtifactToolAcknowledgement(acknowledgement)) {
    return;
  }
  throw new Error(`artifact tool ${requestId} acknowledgement drifted`);
}

function validToolCallTextItem(result) {
  if (result?.success !== true || !Array.isArray(result.contentItems)) {
    return null;
  }
  if (result.contentItems.length !== 1 || result.contentItems[0]?.type !== "inputText") {
    return null;
  }
  return result.contentItems[0];
}

function validArtifactToolAcknowledgement(acknowledgement) {
  return (
    typeof acknowledgement.artifactId === "string" &&
    acknowledgement.kind === "table" &&
    acknowledgement.title === languageCountArtifactArguments.title
  );
}
