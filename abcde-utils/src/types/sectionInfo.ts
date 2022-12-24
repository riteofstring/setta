export type SectionPositionType = { x: number; y: number };

export type SectionInfoType = {
  name: string;
  configId: string;
  sectionChildrenId: string;
  paramInfoId: string | null,
  parentId: string | null;
  initialPosition: SectionPositionType;
};


