import { ObjectValues } from "../generatedTypes";

export const ProjectSearchModeEnum = {
  find: "find",
  advanced: "advanced",
  commandPalette: "commandPalette",
} as const;

export type ProjectSearchMode = ObjectValues<typeof ProjectSearchModeEnum>;
