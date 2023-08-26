import { getCodeInfoForSectionsAndKwargs } from '../codeInfo/load';
import { getSections } from './load';

export async function loadSections(ids) {
  const { sections, nonPresetUITypes, ...rest } = await getSections(ids);
  const codeInfo = await getCodeInfoForSectionsAndKwargs(nonPresetUITypes);
  return { sections, uiTypes: nonPresetUITypes, codeInfo, ...rest };
}
