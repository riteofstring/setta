import { ProjectAddressType } from "./types/project";

export function LOAD_PROJECT({ projectName, configName }: ProjectAddressType) {
  return `/projects/load/${projectName}/${configName}`;
}
