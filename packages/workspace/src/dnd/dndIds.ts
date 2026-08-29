const dndIdSuffix = "-TempDND";

export function getDndSectionId(sectionId: string): string {
  return `${sectionId}${dndIdSuffix}`;
}

export function isTempSection(sectionId: string): boolean {
  return sectionId.slice(-dndIdSuffix.length) === dndIdSuffix;
}
