import { getCodeInfoForSectionsAndKwargs } from '../codeInfo/load';
import { getSections } from './load';

export async function loadSections(ids) {
  const { sections, nonPresetUITypes, kwargCols, ...rest } = await getSections(
    ids,
  );

  const codeInfo = await getCodeInfoForSectionsAndKwargs(
    sections,
    nonPresetUITypes,
    kwargCols,
  );

  return { sections, uiTypes: nonPresetUITypes, kwargCols, codeInfo, ...rest };
}
