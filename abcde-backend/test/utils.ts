import s1 from '../../abcde-frontend/src/__tests__data/simpleTrainTest/Sections';
import s2 from '../../abcde-frontend/src/__tests__data/diffusionDrops/Sections';
import s3 from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/Sections';
import s1Config from '../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionConfigs';
import s2Config from '../../abcde-frontend/src/__tests__data/diffusionDrops/SectionConfigs';
import s3Config from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/SectionConfigs';
import s1Children from '../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionChildren';
import s2Children from '../../abcde-frontend/src/__tests__data/diffusionDrops/SectionChildren';
import s3Children from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/SectionChildren';
import s1ConfigCols from '../../abcde-frontend/src/__tests__data/SectionConfigCols';
import baseUITypes from '../../abcde-frontend/src/__tests__data/BaseUITypes';
import presetUITypes from '../../abcde-frontend/src/__tests__data/PresetUITypes';
import simpleTrainTestUITypes from '../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypes';
import simpleTrainTestUITypesCols from '../../abcde-frontend/src/__tests__data/simpleTrainTest/UITypesCols';
import simpleTrainTestEV from '../../abcde-frontend/src/__tests__data/simpleTrainTest/EV';
import simpleTrainTestEVCols from '../../abcde-frontend/src/__tests__data/simpleTrainTest/EVCols';
import simpleTrainTestKwargCols from '../../abcde-frontend/src/__tests__data/simpleTrainTest/KwargCols';

export function loadAllSections() {
  return { ...s1, ...s2, ...s3 };
}

export function loadAllSectionChildren() {
  return { ...s1Children, ...s2Children, ...s3Children };
}

export function loadAllSectionConfigs() {
  return { ...s1Config, ...s2Config, ...s3Config };
}

export function loadAllSectionConfigCols() {
  return { ...s1ConfigCols };
}

export function loadAllUITypes() {
  return { ...baseUITypes, ...simpleTrainTestUITypes, ...presetUITypes };
}

export function loadAllUITypesCols() {
  return { ...simpleTrainTestUITypesCols };
}

export function loadAllEV() {
  return { ...simpleTrainTestEV };
}

export function loadAllEVCols() {
  return { ...simpleTrainTestEVCols };
}

export function loadAllKwargCols() {
  return { ...simpleTrainTestKwargCols };
}
