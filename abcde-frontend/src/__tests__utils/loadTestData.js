import baseUITypes from "__tests__data/BaseUITypes";
import globalDefaults from "__tests__data/GlobalDefaults";
import presetUITypes from "__tests__data/PresetUITypes";
import codeInfo from "__tests__data/simpleTrainTest/CodeInfo";
import ev from "__tests__data/simpleTrainTest/EV";
import evCols from "__tests__data/simpleTrainTest/EVCols";
import kwargCols from "__tests__data/simpleTrainTest/KwargCols";
import kwargInfo from "__tests__data/simpleTrainTest/KwargInfo";
import project from "__tests__data/simpleTrainTest/Project";
import projectConfig from "__tests__data/simpleTrainTest/ProjectConfig";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults";
import sectionChildren from "__tests__data/simpleTrainTest/SectionChildren";
import sectionChildrenIds from "__tests__data/simpleTrainTest/SectionChildrenIds";
import sectionConfigCol from "__tests__data/simpleTrainTest/SectionConfigCol";
import sectionConfigs from "__tests__data/simpleTrainTest/SectionConfigs";
import sections from "__tests__data/simpleTrainTest/Sections";
import uiTypes from "__tests__data/simpleTrainTest/UITypes";
import uiTypesCols from "__tests__data/simpleTrainTest/UITypesCols";

export function loadTestData() {
  const _project = {
    id: project.id,
    name: project.name,
    configId: projectConfig.id,
    sectionConfigColId: projectConfig.sectionConfigCol,
    childrenId: projectConfig.childrenId,
    children: projectConfig.children,
  };

  const _codeInfo = { ...codeInfo, ...kwargInfo };

  const _uiTypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  return {
    project: _project,
    codeInfo: _codeInfo,
    globalDefaults,
    projectDefaults,
    sections,
    sectionConfigs,
    sectionConfigCol,
    sectionChildren,
    sectionChildrenIds,
    ev,
    evCols,
    uiTypes: _uiTypes,
    uiTypesCols,
    kwargCols,
  };
}
