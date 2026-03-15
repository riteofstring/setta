import { useProjectState, useShareSession } from "state/definitions";
import { CodeLanguage, resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { resolveFileDropSectionKind } from "utils/fileDropSectionKind";
import { route_set_section_name } from "utils/generatedEndpoints";
import {
  type BaseSectionImplUnion,
  CodeFileAccessModeEnum,
  Position,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { validateSectionNameInput } from "utils/nameValidation";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "../sectionInfos";
import { createTopLevelSection } from "./createSections";
import { goToSection } from "./sectionPositions";

type OpenFileInCodeSectionArgs = {
  filePath: string;
  fileName: string;
  codeLanguage: CodeLanguage;
  position?: Position | null;
  focusOnSection?: boolean;
};

type OpenFileInTextSectionArgs = {
  fileName: string;
  text: string;
  format: TextBlockFormatEnum;
  textDisplayMode: TextBlockDisplayModeEnum;
  position?: Position | null;
  focusOnSection?: boolean;
};

type OpenFileInImageSectionArgs = {
  filePath: string;
  fileName: string;
  position?: Position | null;
  focusOnSection?: boolean;
};

type OpenFileInSpreadsheetSectionArgs = {
  filePath: string;
  fileName: string;
  position?: Position | null;
  focusOnSection?: boolean;
};

type OpenFileAsSectionResult =
  | { status: "opened"; sectionId: string }
  | { status: "unsupported_binary" }
  | { status: "failed" };

function normalizeSectionNameCandidate(value: string): string {
  return value
    .replace(/[\\/]/g, " ")
    .replace(/\.\./g, " ")
    .replace(/[^A-Za-z0-9 _-]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim();
}

export function getValidSectionNameForOpenedFile(fileName: string): string {
  const trimmedName = fileName.trim();
  const extensionIndex = trimmedName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0
      ? trimmedName.slice(0, extensionIndex).trim()
      : trimmedName;
  const fallbackName = "Opened File";
  const candidates = [trimmedName, baseName, fallbackName];

  for (const candidate of candidates) {
    const normalized = normalizeSectionNameCandidate(candidate);
    if (!normalized) {
      continue;
    }
    if (validateSectionNameInput(normalized) === null) {
      return normalized;
    }
  }

  return fallbackName;
}

function canOpenFileAsSection(): boolean {
  return !useShareSession.getState().isDeploymentMode;
}

function maybeFocusOpenedSection(
  sectionId: string,
  focusOnSection: boolean,
): void {
  if (focusOnSection) {
    goToSection(sectionId);
  }
}

async function nameOpenedSection({
  fileName,
  sectionId,
}: {
  fileName: string;
  sectionId: string;
}) {
  return route_set_section_name({
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
    name: getValidSectionNameForOpenedFile(fileName),
  });
}

function findExistingOpenedFileSection(
  matchesImpl: (impl: BaseSectionImplUnion) => boolean,
): string | null {
  const projectState = useProjectState.getState();
  for (const sectionId of Object.keys(projectState.sections)) {
    const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
    if (matchesImpl(impl)) {
      return sectionId;
    }
  }
  return null;
}

export async function openFileInCodeSection({
  filePath,
  fileName,
  codeLanguage,
  position = null,
  focusOnSection = true,
}: OpenFileInCodeSectionArgs) {
  if (!canOpenFileAsSection()) {
    return null;
  }

  const existingSectionId = findExistingOpenedFileSection(
    (impl) =>
      impl.type === SectionTypeEnum.Code &&
      !!impl.codeFileBinding &&
      impl.codeFileBinding.canonical_path === filePath,
  );
  if (existingSectionId) {
    maybeFocusOpenedSection(existingSectionId, focusOnSection);
    return existingSectionId;
  }

  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.Code,
    implOverrides: {
      type: SectionTypeEnum.Code,
      codeLanguage,
      codeFileBinding: {
        canonical_path: filePath,
        access_mode: CodeFileAccessModeEnum.read_write,
      },
    },
    position,
  });
  if (!newSectionId) {
    return null;
  }

  await nameOpenedSection({ fileName, sectionId: newSectionId });
  maybeFocusOpenedSection(newSectionId, focusOnSection);
  return newSectionId;
}

export async function openFileInTextSection({
  fileName,
  text,
  format,
  textDisplayMode,
  position = null,
  focusOnSection = true,
}: OpenFileInTextSectionArgs) {
  if (!canOpenFileAsSection()) {
    return null;
  }

  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.TextBlock,
    implOverrides: {
      type: SectionTypeEnum.TextBlock,
      format,
      textDisplayMode,
      text,
    },
    position,
  });
  if (!newSectionId) {
    return null;
  }

  await nameOpenedSection({ fileName, sectionId: newSectionId });
  maybeFocusOpenedSection(newSectionId, focusOnSection);
  return newSectionId;
}

export async function openFileInImageSection({
  filePath,
  fileName,
  position = null,
  focusOnSection = true,
}: OpenFileInImageSectionArgs) {
  if (!canOpenFileAsSection()) {
    return null;
  }

  const existingSectionId = findExistingOpenedFileSection(
    (impl) =>
      impl.type === SectionTypeEnum.Image && impl.imagePath === filePath,
  );
  if (existingSectionId) {
    maybeFocusOpenedSection(existingSectionId, focusOnSection);
    return existingSectionId;
  }

  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.Image,
    implOverrides: {
      type: SectionTypeEnum.Image,
      imagePath: filePath,
    },
    position,
  });
  if (!newSectionId) {
    return null;
  }

  await nameOpenedSection({ fileName, sectionId: newSectionId });
  maybeFocusOpenedSection(newSectionId, focusOnSection);
  return newSectionId;
}

export async function openFileInSpreadsheetSection({
  filePath,
  fileName,
  position = null,
  focusOnSection = true,
}: OpenFileInSpreadsheetSectionArgs) {
  if (!canOpenFileAsSection()) {
    return null;
  }

  const normalizedPath = filePath.trim();
  const existingSectionId = findExistingOpenedFileSection(
    (impl) =>
      impl.type === SectionTypeEnum.Spreadsheet &&
      impl.filePath.trim() === normalizedPath,
  );
  if (existingSectionId) {
    maybeFocusOpenedSection(existingSectionId, focusOnSection);
    return existingSectionId;
  }

  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.Spreadsheet,
    implOverrides: {
      type: SectionTypeEnum.Spreadsheet,
      filePath: normalizedPath,
      activeSheet: null,
    },
    position,
  });
  if (!newSectionId) {
    return null;
  }

  await nameOpenedSection({ fileName, sectionId: newSectionId });
  maybeFocusOpenedSection(newSectionId, focusOnSection);
  return newSectionId;
}

export async function openFileAsSectionForDrop({
  filePath,
  fileName,
  position,
  focusOnSection = true,
}: {
  filePath: string;
  fileName: string;
  position: Position | null;
  focusOnSection?: boolean;
}): Promise<OpenFileAsSectionResult> {
  const kind = resolveFileDropSectionKind({ fileName, filePath });

  if (kind === "unsupported_binary") {
    return { status: "unsupported_binary" };
  }

  let sectionId: string | null = null;
  if (kind === "spreadsheet") {
    sectionId = await openFileInSpreadsheetSection({
      filePath,
      fileName,
      position,
      focusOnSection,
    });
  } else if (kind === "image") {
    sectionId = await openFileInImageSection({
      filePath,
      fileName,
      position,
      focusOnSection,
    });
  } else {
    sectionId = await openFileInCodeSection({
      filePath,
      fileName,
      codeLanguage: resolveCodeLanguageFromPath(filePath),
      position,
      focusOnSection,
    });
  }

  if (!sectionId) {
    return { status: "failed" };
  }
  return { status: "opened", sectionId };
}
