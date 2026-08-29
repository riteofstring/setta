// The temp-section id scheme from the reference's `dndState.ts`, split into its own module so
// the drag-session store and the dnd children store can share it without a cycle.
const dndIdSuffix = "-TempDND";

export function getDndSectionId(sectionId: string): string {
  return `${sectionId}${dndIdSuffix}`;
}

export function isTempSection(sectionId: string): boolean {
  return sectionId.slice(-dndIdSuffix.length) === dndIdSuffix;
}
