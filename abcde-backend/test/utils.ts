import s1 from '../../abcde-frontend/src/__tests__data/simpleTrainTest/Sections';
import s2 from '../../abcde-frontend/src/__tests__data/diffusionDrops/Sections';
import s3 from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/Sections';
import s1Config from '../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionConfigs';
import s2Config from '../../abcde-frontend/src/__tests__data/diffusionDrops/SectionConfigs';
import s3Config from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/SectionConfigs';
import s1Children from '../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionChildren';
import s2Children from '../../abcde-frontend/src/__tests__data/diffusionDrops/SectionChildren';
import s3Children from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/SectionChildren';

export function loadAllSections() {
  return { ...s1, ...s2, ...s3 };
}

export function loadAllSectionChildren() {
  return { ...s1Children, ...s2Children, ...s3Children };
}

export function loadAllSectionConfigs() {
  return { ...s1Config, ...s2Config, ...s3Config };
}
