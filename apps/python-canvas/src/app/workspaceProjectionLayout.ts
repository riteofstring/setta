import type { WorkspaceSection } from "@setta/workspace";

export const CALLABLE_SECTION_SIZE = { width: 250, height: 150 } as const;
export const PARAMETER_DICTIONARY_SECTION_SIZE = {
  width: 420,
  height: 300,
} as const;
export const LIST_SECTION_SIZE = { width: 250, height: 50 } as const;
export const GENERATED_PYTHON_SECTION_SIZE = {
  width: 640,
  height: 420,
} as const;

const INITIAL_SECTION_ROW_HEIGHT = Math.max(
  CALLABLE_SECTION_SIZE.height,
  PARAMETER_DICTIONARY_SECTION_SIZE.height,
  LIST_SECTION_SIZE.height,
);

export function sectionLayout(index: number, section: WorkspaceSection) {
  const width =
    typeof section.size.width === "number"
      ? section.size.width
      : CALLABLE_SECTION_SIZE.width;
  const height =
    typeof section.size.height === "number"
      ? section.size.height
      : CALLABLE_SECTION_SIZE.height;
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: column * (width + 32),
    y: row * (height + 32),
    w: width,
    h: height,
    zIndex: index,
  };
}

export function generatedPythonLayout(topLevelCount: number) {
  const rows = Math.max(1, Math.ceil(topLevelCount / 2));
  return {
    x: 0,
    y: rows * (INITIAL_SECTION_ROW_HEIGHT + 48),
    w: GENERATED_PYTHON_SECTION_SIZE.width,
    h: GENERATED_PYTHON_SECTION_SIZE.height,
    zIndex: topLevelCount,
  };
}
