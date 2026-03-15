import { useProjectState, useShareSession } from "state/definitions";
import { route_set_section_name } from "utils/generatedEndpoints";
import { type BaseSectionImplUnion } from "utils/generatedTypes";
import { validateSectionNameInput } from "utils/nameValidation";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "../sectionInfos";
import { goToSection } from "./sectionPositions";

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

export function canOpenFileAsSection(): boolean {
  return !useShareSession.getState().isDeploymentMode;
}

export function maybeFocusOpenedSection(
  sectionId: string,
  focusOnSection: boolean,
): void {
  if (focusOnSection) {
    goToSection(sectionId);
  }
}

export async function nameOpenedSection({
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

export function findExistingOpenedFileSection(
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
