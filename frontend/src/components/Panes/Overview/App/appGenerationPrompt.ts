type BuildAppGenerationPromptArgs = {
  catalogSummary: string;
  sectionsSummary: string;
  viewModesSummary: string;
  navigationInstructions: string;
  appSpecStreamingEnabled: boolean;
};

function buildDeliveryInstructions(appSpecStreamingEnabled: boolean): string {
  if (appSpecStreamingEnabled) {
    return [
      "Streaming mode: ENABLED",
      "- DO NOT paste JSON into the chat.",
      '- Call the MCP tool setta__stream_app_definition with { "patches": <JSONL patches string>, "routes": <routes list> }.',
      "- For updates: omit baseAppSpec to patch the currently saved spec (or pass baseAppSpec explicitly).",
      "- patches must be newline-delimited JSON objects with keys: op, path, value (unless op=remove).",
      "- Allowed paths: /root and /elements/<key> (and nested paths under /elements/<key>/...).",
      "- Prefer op 'set'. Ensure /root references an element present in /elements.",
      "- For live preview: set /root and /elements/<root> first (a minimal root element with children: []).",
      "- Only patch nested paths under /elements/<key>/... after you have set /elements/<key> at least once.",
      "- End each patch line with a newline so patches can apply incrementally.",
      "- When setting /elements/<key>, the value must be a UIElement with top-level { key: string, type: string }.",
      "- routes is a JSON list of { path, name, rootKey } and is saved alongside the spec for app pages/navigation.",
      "Example JSONL (each line is exactly one JSON object; this is what goes in the patches string):",
      `{"op":"set","path":"/root","value":"root"}`,
      `{"op":"set","path":"/elements/root","value":{"key":"root","type":"Stack","props":{"direction":"column","gap":16},"children":["title"]}}`,
      `{"op":"set","path":"/elements/title","value":{"key":"title","type":"Heading","props":{"level":1,"text":"Hello"}}}`,
      "- The tool persists the app spec and will error if the final spec is invalid.",
    ].join("\n");
  }

  return [
    "Streaming mode: DISABLED",
    "- DO NOT paste JSON into the chat.",
    '- Call the MCP tool setta__set_app_definition with { "appSpec": <UITree JSON>, "routes": <routes list> }.',
    "- Optional (recommended): call setta__validate_app_definition first and fix any errors.",
  ].join("\n");
}

function normalizeInstructionBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "(none)";
  }
  return trimmed;
}

export function buildAppGenerationPrompt({
  catalogSummary,
  sectionsSummary,
  viewModesSummary,
  navigationInstructions,
  appSpecStreamingEnabled,
}: BuildAppGenerationPromptArgs): string {
  const deliveryInstructions = buildDeliveryInstructions(
    appSpecStreamingEnabled,
  );
  const navBlock = normalizeInstructionBlock(navigationInstructions);

  const promptParts: string[] = [
    "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
    "",
    "Goal:",
    "- Build a standalone web app for this Setta project.",
    "- Mobile-first, but desktop-friendly: avoid ultra-wide stretching and use responsive multi-column layouts.",
    "- Default to Setta's app look/feel. Do NOT invent branding or custom themes unless the user provides a style reference (image/palette) or explicitly requests it.",
    "",
    "Layout rules:",
    "- Every page root should use Container to constrain max width.",
    "- Prefer a responsive Grid (columns: { base: 1, md: 2 } or similar) so desktop uses whitespace well.",
    "- Use Cards to group related inputs/outputs.",
    "- Do NOT add a big header bar inside appSpec (navigation/header chrome is provided by the app shell).",
    "",
    "Pages and navigation:",
    navBlock,
    "",
    "Component rules:",
    "- Use only catalog components.",
    "- Bind ParamInput with sectionId + paramId (or dataPath -> dataBindings).",
    "- Only bind ParamInput to leaf (childless) param types (TextParam/TextAreaParam/SliderParam/DropdownParam/SwitchParam/etc). Do NOT bind ParamInput to NestedParam or ButtonParam.",
    "- Do not bind ParamInput to CodeParam params; CodeParam edits are blocked in app deployments.",
    "- dataPath values must be JSON Pointer strings (example: /params/name).",
    '- Include one ActionButton with action "run" and set its sectionId.',
    "",
    "UITree / UIElement schema (important):",
    "- UITree: { root: UIElement | string, elements: { [key: string]: UIElement } }",
    "- UIElement must have top-level { key: string, type: string }.",
    "- Component props go under 'props' (object). Do not put props at the top level.",
    "- Children go under 'children' (array). Even for one child, use an array.",
    "- In elements, the map key should match UIElement.key.",
    "",
    "How to deliver:",
    deliveryInstructions,
    "",
    catalogSummary,
    "",
    ...(viewModesSummary.trim() ? [viewModesSummary, ""] : []),
    "Available sections (use ids as sectionId; param ids are paramId):",
    sectionsSummary.trim() ? sectionsSummary : "No sections yet.",
    "",
    "Output:",
    "- appSpec: UITree object: { root: UIElement | string, elements: { [key]: UIElement } }",
    "- routes: list of { path, name, rootKey }",
  ];

  return promptParts.join("\n");
}
