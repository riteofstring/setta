import { ManyCodeInfoType } from 'abcde-utils/src/types/codeInfo';
import { remapIds } from 'src/utils/utils';

export function copyCodeInfo(codeInfo: ManyCodeInfoType) {
  const { newIds: newCodeInfo, idMap: codeInfoIdMap } = remapIds(codeInfo);

  for (const c of Object.values(newCodeInfo)) {
    c.id = codeInfoIdMap[c.id] ?? c.id;
    c.children = c.children.map((x) => codeInfoIdMap[x]);
  }

  return { newCodeInfo, codeInfoIdMap };
}
