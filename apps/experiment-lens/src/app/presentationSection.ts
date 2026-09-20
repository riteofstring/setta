import type {
  FieldDefinition,
  LensSnapshot,
  PresentationSection,
} from "../api/generatedContract";

type PresentationSectionType = PresentationSection["type"];

export function presentationSectionDataId(data: unknown): string {
  if (
    typeof data !== "object" ||
    data === null ||
    !("presentationSectionId" in data) ||
    typeof data.presentationSectionId !== "string"
  ) {
    throw new Error("Experiment Lens section data is invalid.");
  }
  return data.presentationSectionId;
}

export function presentationFields(
  snapshot: LensSnapshot,
  fieldIds: readonly string[],
): FieldDefinition[] {
  return fieldIds.map((fieldId) => {
    const field = snapshot.experiment.fields.find(
      (candidate) => candidate.id === fieldId,
    );
    if (!field) {
      throw new Error(`Experiment Lens field ${fieldId} is unknown.`);
    }
    return field;
  });
}

export function presentationSection<T extends PresentationSectionType>(
  snapshot: LensSnapshot,
  sectionId: string,
  type: T,
): Extract<PresentationSection, { type: T }> {
  const definition = snapshot.experiment.presentation.sections.find(
    (section) => section.id === sectionId,
  );
  if (!definition || definition.type !== type) {
    throw new Error(
      `Experiment Lens section ${sectionId} is not a ${type} section.`,
    );
  }
  return definition as Extract<PresentationSection, { type: T }>;
}
