export const languageCountTableArtifactArguments = {
  source: [
    "root = Document([",
    '  Heading("Language line counts"),',
    '  Table([{key: "language", label: "Language"}, {key: "lines", label: "Lines"}], [["Go", "34"], ["TypeScript", "21"], ["CSS", "8"]])',
    "])",
  ].join("\n"),
  kind: "Report",
  summary: "Line counts across the three languages this repository is written in.",
  title: "Language line counts",
};

export const languageCountBarChartArtifactArguments = {
  source: [
    "root = Document([",
    '  BarChart([{name: "Lines", points: [{label: "Go", value: 34}, {label: "TypeScript", value: 21}, {label: "CSS", value: 8}]}], "Lines by language")',
    "])",
  ].join("\n"),
  kind: "Report",
  summary: "The same line counts as a chart, so the split is visible at a glance.",
  title: "Language line count chart",
};

export const qualitativeMarkdownArtifactArguments = {
  source: [
    "root = Document([",
    '  Markdown("## Release themes\\n\\n- Reliability work is complete.\\n- Interface polish is ready for review.")',
    "])",
  ].join("\n"),
  kind: "Notes",
  summary: "What this release changed, in themes rather than in commits.",
  title: "Qualitative release notes",
};

export const numericComparisonArtifactArguments = {
  source: [
    "root = Document([",
    '  BarChart([{name: "Cases", points: [{label: "North", value: 12}, {label: "South", value: 18}, {label: "West", value: 7}]}], "Cases by region")',
    "])",
  ].join("\n"),
  kind: "Comparison",
  summary: "Case volume by region, with the South carrying the most.",
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
  kind: "Memo",
  summary: "The policy memo covering four areas, with owners and the generated file.",
  title: "Policy memo",
};

// An unbound turn runs in a private Setta-owned directory, so a file it can
// see there is still not a file an artifact may address. The scenario writes
// the file into that directory first, so the rejection proves the authorization
// boundary rather than a missing file.
export const privateDirectoryReferenceArtifactArguments = {
  source: [
    "root = Document([",
    '  Text("The unbound run tried to address a file from its own working directory."),',
    '  FileReference("docs/setta-artifact-policy-memo.md", "Private working-directory file")',
    "])",
  ].join("\n"),
  kind: "Reference",
  summary: "An attempt to address a file the unbound run may see but may not publish.",
  title: "Private directory reference",
};

// Incomplete in exactly one field: the document. Everything a reader needs
// before opening it is here, so the rejection is about the artifact's content
// rather than about its label.
export const incompleteArtifactArguments = {
  kind: "Report",
  summary: "Line counts that were never actually written into a document.",
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
    artifacts: [privateDirectoryReferenceArtifactArguments],
    completion: "Completed supplied private-directory reference as prose.",
    expectedFailureCode: "invalid_file_reference",
    expectedFailureFields: ["source"],
    trigger: "supplied private directory reference",
    unresolvedFailure: true,
    workspaceFiles: ["docs/setta-artifact-policy-memo.md"],
  },
  {
    artifacts: [incompleteArtifactArguments],
    completion: "Completed supplied incomplete artifact after prose fallback.",
    expectedFailureCode: "missing_required_fields",
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

export function validateArtifactToolFailureResult(requestId, result, expectedCode, expectedFields) {
  const item = validToolCallFailureTextItem(result);
  if (!item) {
    throw new Error(`artifact tool ${requestId} returned malformed failure result`);
  }
  const failure = JSON.parse(item.text);
  if (!validRetryableFieldFailure(failure, expectedCode, expectedFields)) {
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

// The tool takes one document and the three things a reader needs before
// opening it. A branch union here would mean the backend still models artifact
// kinds.
function hasDocumentInputSchema(schema) {
  if (schema === null || typeof schema !== "object") {
    return false;
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties ?? {};
  return [
    schema.type === "object",
    schema.additionalProperties === false,
    schema.oneOf === undefined,
    required.includes("title"),
    required.includes("kind"),
    required.includes("summary"),
    required.includes("source"),
    isStringSchema(properties.title),
    isStringSchema(properties.kind),
    isStringSchema(properties.summary),
    isStringSchema(properties.source),
  ].every(Boolean);
}

function isStringSchema(property) {
  return property?.type === "string";
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

function validRetryableFieldFailure(failure, expectedCode, expectedFields) {
  return (
    failure?.code === expectedCode &&
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
