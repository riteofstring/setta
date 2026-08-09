import { isValidWorkspaceColor, type WorkspaceSectionPresentation } from "../core.js";
import { optionOverridesAt } from "./runtime-option-validation.js";

export function normalizeWorkspaceSectionTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Workspace section title must be a string.");
  }
  const title = value.trim();
  if (title.length === 0) {
    throw new TypeError("Workspace section title must not be empty.");
  }
  return title;
}

export function resolveWorkspaceSectionPresentation(value: unknown): WorkspaceSectionPresentation {
  const record = optionOverridesAt(
    value,
    ["accentColor", "chrome", "tagColor"],
    "Workspace section presentation",
    "workspace section presentation field",
  );
  const missingKey = (["accentColor", "chrome", "tagColor"] as const).find(
    (key) => !Object.hasOwn(record, key),
  );
  if (missingKey) {
    throw new TypeError(`Workspace section presentation must provide ${missingKey}.`);
  }
  return {
    accentColor: sectionPresentationColor(record.accentColor, "accent color"),
    chrome: sectionChrome(record.chrome),
    tagColor: sectionPresentationColor(record.tagColor, "tag color"),
  };
}

function sectionChrome(value: unknown): WorkspaceSectionPresentation["chrome"] {
  if (value !== "compact" && value !== "default" && value !== "none" && value !== "transparent") {
    throw new TypeError(
      "Workspace section presentation chrome must be compact, default, none, or transparent.",
    );
  }
  return value;
}

function sectionPresentationColor(value: unknown, label: string): string | null {
  if (value !== null && (typeof value !== "string" || !isValidWorkspaceColor(value))) {
    throw new TypeError(`Workspace section presentation ${label} must be null or a valid color.`);
  }
  return value;
}
