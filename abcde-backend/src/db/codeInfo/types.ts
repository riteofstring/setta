export type ParentChildPairsType = { parentId: string; childId: string }[];

export type OrderedParentChildPairsType = {
  parentId: string;
  childId: string;
  order: number;
}[];

export type ChildMapType = {
  [parentId: string]: {
    parentId: string;
    childId: string;
    order: number;
  }[];
};
