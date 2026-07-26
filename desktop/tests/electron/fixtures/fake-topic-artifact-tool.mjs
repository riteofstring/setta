export const languageCountTableArtifactArguments = {
  source: [
    "root = Document([",
    '  Heading("Language line counts"),',
    '  Table([{key: "language", label: "Language"}, {key: "lines", label: "Lines"}], [["Go", "34"], ["TypeScript", "21"], ["CSS", "8"]])',
    "])",
  ].join("\n"),
  title: "Language line counts",
};

export const languageCountBarChartArtifactArguments = {
  source: [
    "root = Document([",
    '  BarChart([{name: "Lines", points: [{label: "Go", value: 34}, {label: "TypeScript", value: 21}, {label: "CSS", value: 8}]}], "Lines by language")',
    "])",
  ].join("\n"),
  title: "Language line count chart",
};

export const qualitativeMarkdownArtifactArguments = {
  source: [
    "root = Document([",
    '  Markdown("## Release themes\\n\\n- Reliability work is complete.\\n- Interface polish is ready for review.")',
    "])",
  ].join("\n"),
  title: "Qualitative release notes",
};

export const numericComparisonArtifactArguments = {
  source: [
    "root = Document([",
    '  BarChart([{name: "Cases", points: [{label: "North", value: 12}, {label: "South", value: 18}, {label: "West", value: 7}]}], "Cases by region")',
    "])",
  ].join("\n"),
  title: "Regional case comparison",
};

// A mixed document is the point of the composable format: one artifact carries
// prose, a metric, a table, and a file reference rather than four artifacts.
export const mixedDocumentArtifactArguments = {
  source: [
    "root = Document([",
    '  Section("Summary", [',
    '    Text("The policy memo is ready for review."),',
    '    Metric("Sections", "4", "one per policy area", "neutral")',
    "  ]),",
    '  Table([{key: "area", label: "Area"}, {key: "owner", label: "Owner"}], [["Retention", "Platform"], ["Access", "Security"]], "Owners by policy area"),',
    '  FileReference("docs/setta-artifact-policy-memo.md", "Generated policy memo")',
    "])",
  ].join("\n"),
  title: "Policy memo",
};

export const incompleteArtifactArguments = {
  title: "Language line counts",
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
    artifacts: [mixedDocumentArtifactArguments],
    completion: "Completed supplied mixed document.",
    trigger: "supplied mixed document",
    workspaceFiles: ["docs/setta-artifact-policy-memo.md"],
  },
  {
    artifacts: [],
    completion: "Completed supplied conversational answer without a durable artifact.",
    trigger: "supplied conversational answer",
  },
  {
    artifacts: [incompleteArtifactArguments],
    completion: "Completed supplied incomplete artifact after prose fallback.",
    expectedFailureFields: ["source"],
    trigger: "supplied incomplete artifact without retry",
    unresolvedFailure: true,
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

export function validateArtifactToolFailureResult(requestId, result, expectedFields) {
  const item = validToolCallFailureTextItem(result);
  if (!item) {
    throw new Error(`artifact tool ${requestId} returned malformed failure result`);
  }
  const failure = JSON.parse(item.text);
  if (!validMissingFieldsFailure(failure, expectedFields)) {
    throw new Error(`artifact tool ${requestId} failure drifted: ${JSON.stringify(failure)}`);
  }
}

export function threadHasArtifactTool(thread) {
  return (thread?.dynamicTools ?? []).some((tool) => {
    if (tool?.type !== "namespace" || tool.name !== "setta" || !Array.isArray(tool.tools)) {
      return false;
    }
    return tool.tools.some(
      (child) =>
        child?.type === "function" &&
        child.name === "emit_artifact" &&
        hasDocumentInputSchema(child.inputSchema),
    );
  });
}

// The tool takes one document, so its schema is a strict two-field object. A
// branch union here would mean the backend still models artifact kinds.
function hasDocumentInputSchema(schema) {
  if (schema?.type !== "object" || schema.additionalProperties !== false) {
    return false;
  }
  if (schema.oneOf !== undefined) {
    return false;
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  return (
    required.includes("title") &&
    required.includes("source") &&
    schema.properties?.title?.type === "string" &&
    schema.properties?.source?.type === "string"
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

function validToolCallFailureTextItem(result) {
  if (result?.success !== false || !Array.isArray(result.contentItems)) {
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
    acknowledgement.title === expectedArguments.title
  );
}

function validMissingFieldsFailure(failure, expectedFields) {
  return (
    failure?.code === "missing_required_fields" &&
    failure.retryable === true &&
    nonEmptyString(failure.message) &&
    nonEmptyString(failure.diagnosticReference) &&
    fieldsContainEvery(failure.fieldErrors, expectedFields)
  );
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function fieldsContainEvery(fieldErrors, expectedFields) {
  if (!Array.isArray(fieldErrors)) {
    return false;
  }
  const fields = new Set(fieldErrors.map((fieldError) => fieldError?.field));
  return expectedFields.every((field) => fields.has(field));
}
