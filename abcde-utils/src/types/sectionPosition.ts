export type SectionPositionType = { x: number; y: number };

export type SiblingSectionPositionType = { [id: string]: SectionPositionType };

export type ChildrenSectionPositionType = {
  [id: string]: SiblingSectionPositionType;
};

export type TopLevelSectionPositionType = { null: SiblingSectionPositionType };
