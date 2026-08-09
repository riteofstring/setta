export type SettaProjectNameValidationErrors = {
  projectConfigId: string;
  projectErrors: Array<string>;
  sectionErrors: Record<string, Array<string>>;
  paramErrors: Record<string, Array<string>>;
};
