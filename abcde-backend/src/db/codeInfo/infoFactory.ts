import {
  CodeInfoStateType,
  ManyCodeInfoType,
} from 'abcde-utils/src/types/codeInfo';

export function createAllInfo(packages: ManyCodeInfoType): CodeInfoStateType {
  const allCodeInfo = packages;
  return { allCodeInfo };
}
