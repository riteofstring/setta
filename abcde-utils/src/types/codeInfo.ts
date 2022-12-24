export interface CodeInfoType {
  id: string;
  name: string;
  version: string | null;
  defaultVal: string | null;
  type: string;
  description: string | null;
  rcType: RCType;
  inCodeParentId: string | null;
  path: string;
  children: string[];
}

export enum RCType {
  COLLECTION = "collection",
  CALLABLE = "callable",
  PARAMETER = "parameter",
}
