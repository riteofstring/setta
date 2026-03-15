import { type CodeLanguage } from "utils/codeLanguage";
import {
  CodeFileAccessModeEnum,
  Position,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import {
  canOpenFileAsSection,
  findExistingOpenedFileSection,
  maybeFocusOpenedSection,
  nameOpenedSection,
} from "./createSectionFileOpenShared";
import { createTopLevelSection } from "./createSections";

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
