export const languageCountTableArtifactArguments = {
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

export const languageCountBarChartArtifactArguments = {
  items: [
    { label: "Go", value: 34, unit: "lines" },
    { label: "TypeScript", value: 21, unit: "lines" },
    { label: "CSS", value: 8, unit: "lines" },
  ],
  kind: "bar_chart",
  title: "Language line count chart",
};

export const qualitativeMarkdownArtifactArguments = {
  kind: "markdown",
  markdown:
    "## Release themes\n\n- Reliability work is complete.\n- Interface polish is ready for review.",
  title: "Qualitative release notes",
};

export const numericComparisonArtifactArguments = {
  items: [
    { label: "North", value: 12, unit: "cases" },
    { label: "South", value: 18, unit: "cases" },
    { label: "West", value: 7, unit: "cases" },
  ],
  kind: "bar_chart",
  title: "Regional case comparison",
};

export const generatedFileArtifactArguments = {
  description: "Generated policy memo",
  kind: "file",
  path: "/tmp/setta-artifact-policy-memo.md",
  title: "Policy memo file",
};

export const artifactPolicyScenarios = [
  {
    artifacts: [languageCountTableArtifactArguments, languageCountBarChartArtifactArguments],
    completion: "Completed supplied language-count artifacts.",
    trigger: "supplied language-counts dataset",
  },
  {
    artifacts: [qualitativeMarkdownArtifactArguments],
    completion: "Completed supplied qualitative artifact.",
    trigger: "supplied qualitative release notes",
  },
  {
    artifacts: [numericComparisonArtifactArguments],
    completion: "Completed supplied numeric comparison.",
    trigger: "supplied numeric comparison",
  },
  {
    artifacts: [generatedFileArtifactArguments],
    completion: "Completed supplied generated file.",
    trigger: "supplied generated file",
  },
  {
    artifacts: [],
    completion: "Completed supplied conversational answer without a durable artifact.",
    trigger: "supplied conversational answer",
  },
];

export function artifactPolicyScenarioForText(text) {
  return artifactPolicyScenarios.find((scenario) => text.includes(scenario.trigger)) ?? null;
}

export function validateArtifactToolResult(requestId, result, expectedArguments) {
  const item = validToolCallTextItem(result);
  if (!item) {
    throw new Error(`artifact tool ${requestId} returned malformed result`);
  }
  const acknowledgement = JSON.parse(item.text);
  if (validArtifactToolAcknowledgement(acknowledgement, expectedArguments)) {
    return;
  }
  throw new Error(`artifact tool ${requestId} acknowledgement drifted`);
}

const requiredArtifactKinds = ["markdown", "table", "bar_chart", "file"];

export function threadHasArtifactTool(thread) {
  return (thread?.dynamicTools ?? []).some((tool) => {
    if (tool?.type !== "namespace" || tool.name !== "setta" || !Array.isArray(tool.tools)) {
      return false;
    }
    return tool.tools.some(
      (child) =>
        child?.type === "function" &&
        child.name === "emit_artifact" &&
        hasRequiredArtifactKindBranches(child.inputSchema),
    );
  });
}

function hasRequiredArtifactKindBranches(schema) {
  const branches = Array.isArray(schema?.oneOf) ? schema.oneOf : [];
  return requiredArtifactKinds.every((kind) =>
    branches.some(
      (branch) =>
        branch?.additionalProperties === false && branch?.properties?.kind?.const === kind,
    ),
  );
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

function validArtifactToolAcknowledgement(acknowledgement, expectedArguments) {
  return (
    typeof acknowledgement.artifactId === "string" &&
    acknowledgement.kind === expectedArguments.kind &&
    acknowledgement.title === expectedArguments.title
  );
}
