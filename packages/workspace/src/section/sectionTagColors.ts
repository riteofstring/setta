import type { WorkspaceColorChoice } from "../document/types";

const SECTION_TAG_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;

export type WorkspaceSectionTagColorChoice = Readonly<WorkspaceColorChoice>;
export type WorkspaceSectionTagColorPalette =
  ReadonlyArray<WorkspaceSectionTagColorChoice>;

export const DEFAULT_SECTION_TAG_COLOR_PALETTE: WorkspaceSectionTagColorPalette =
  Object.freeze(
    [
      { color: "#ef4444", description: "Red" },
      { color: "#f97316", description: "Orange" },
      { color: "#eab308", description: "Yellow" },
      { color: "#22c55e", description: "Green" },
      { color: "#06b6d4", description: "Cyan" },
      { color: "#3b82f6", description: "Blue" },
      { color: "#a855f7", description: "Purple" },
      { color: "#64748b", description: "Slate" },
    ].map((choice) => Object.freeze(choice)),
  );

function normalizeHexColor(value: unknown, subject: string): string {
  if (typeof value !== "string") {
    throw new Error(`${subject} must be a six-digit hex color.`);
  }
  const normalized = value.trim().toLowerCase();
  const canonical = normalized.startsWith("#") ? normalized : `#${normalized}`;
  if (!SECTION_TAG_COLOR_PATTERN.test(canonical)) {
    throw new Error(`${subject} must be a six-digit hex color.`);
  }
  return canonical;
}

export function normalizeSectionTagColor(
  value: unknown,
  subject = "Section tag color",
): string | null {
  return value === null ? null : normalizeHexColor(value, subject);
}

export function resolveSectionTagColorPalette(
  palette: WorkspaceSectionTagColorPalette | undefined,
): WorkspaceSectionTagColorPalette {
  if (palette === undefined) {
    return DEFAULT_SECTION_TAG_COLOR_PALETTE;
  }
  if (!Array.isArray(palette)) {
    throw new Error("Workspace section tag color palette must be an array.");
  }
  const colors = new Set<string>();
  const resolved = palette.map((choice, index) => {
    if (
      typeof choice !== "object" ||
      choice === null ||
      Array.isArray(choice)
    ) {
      throw new Error(
        `Workspace section tag color palette category ${index} must be an object.`,
      );
    }
    const color = normalizeHexColor(
      choice.color,
      `Workspace section tag color palette category ${index} color`,
    );
    if (colors.has(color)) {
      throw new Error(
        `Workspace section tag color palette repeats color ${color}.`,
      );
    }
    colors.add(color);
    if (
      typeof choice.description !== "string" ||
      choice.description.trim() === ""
    ) {
      throw new Error(
        `Workspace section tag color palette category ${index} requires a non-empty description.`,
      );
    }
    return Object.freeze({ color, description: choice.description.trim() });
  });
  return Object.freeze(resolved);
}
