import { ManyOf } from "./utils";

export type SectionPositionType = { x: number; y: number; zIndex: number };

export type ManySectionPositionType = ManyOf<SectionPositionType>;
