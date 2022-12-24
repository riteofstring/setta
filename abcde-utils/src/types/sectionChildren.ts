export type SectionChildrenType = string[];

export type ManySectionChildrenType = { [id: string]: SectionChildrenType };

export type TopLevelSectionChildrenType = { null: SectionChildrenType };
