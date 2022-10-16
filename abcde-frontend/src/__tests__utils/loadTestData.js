import baseUITypes from "__tests__data/BaseUITypes";
import presetUITypes from "__tests__data/PresetUITypes";
import projectConfigs from "__tests__data/ProjectConfigs";
import projects from "__tests__data/Projects";
import sectionConfigCols from "__tests__data/SectionConfigCols";
import codeInfo from "__tests__data/simpleTrainTest/CodeInfo";
import ev from "__tests__data/simpleTrainTest/EV";
import evCols from "__tests__data/simpleTrainTest/EVCols";
import globalDefaults from "__tests__data/simpleTrainTest/GlobalDefaults";
import kwargCols from "__tests__data/simpleTrainTest/KwargCols";
import kwargInfo from "__tests__data/simpleTrainTest/KwargInfo";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults";
import sectionChildren from "__tests__data/simpleTrainTest/SectionChildren";
import sectionConfigs from "__tests__data/simpleTrainTest/SectionConfigs";
import sections from "__tests__data/simpleTrainTest/Sections";
import uiTypes from "__tests__data/simpleTrainTest/UITypes";
import uiTypesCols from "__tests__data/simpleTrainTest/UITypesCols";

export function loadTestData(
  projectId = "61e089c8-62bf-4e8c-915e-111b4587da81"
) {
  let project = projects[projectId];
  const configId = project.defaultConfig;
  const config = projectConfigs[configId];
  const sectionConfigColId = config.sectionConfigCol;
  const sectionConfigCol = sectionConfigCols[sectionConfigColId];

  project = {
    id: project.id,
    name: project.name,
    configId,
    sectionConfigColId,
  };

  return {
    project,
    codeInfo: { ...codeInfo, ...kwargInfo },
    globalDefaults,
    projectDefaults,
    sections,
    sectionConfigs,
    sectionConfigCol,
    sectionChildren,
    ev,
    evCols,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    uiTypesCols,
    kwargCols,
  };
}
