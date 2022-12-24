import { ManyOf } from "./utils";

export type SectionChildrenType = string[];

export type ManySectionChildrenType = ManyOf<SectionChildrenType>;

export type TopLevelSectionChildrenType = { null: SectionChildrenType };
