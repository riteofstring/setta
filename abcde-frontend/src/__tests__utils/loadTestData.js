import _ from "lodash";
import codeInfo from "__tests__data/AllCodeInfo";
import baseUITypes from "__tests__data/BaseUITypes";
import presetUITypes from "__tests__data/PresetUITypes";
import projectConfigs from "__tests__data/ProjectConfigs";
import projects from "__tests__data/Projects";
import sectionConfigCols from "__tests__data/SectionConfigCols";
import ev from "__tests__data/simpleTrainTest/EV";
import evCols from "__tests__data/simpleTrainTest/EVCols";
import globalDefaults from "__tests__data/simpleTrainTest/GlobalDefaults";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults";
import sectionChildren from "__tests__data/simpleTrainTest/SectionChildren";
import sectionConfigs from "__tests__data/simpleTrainTest/SectionConfigs";
import sections from "__tests__data/simpleTrainTest/Sections";
import uiTypes from "__tests__data/simpleTrainTest/UITypes";
import uiTypesCols from "__tests__data/simpleTrainTest/UITypesCols";

export function loadTestData() {
  const project = projects["61e089c8-62bf-4e8c-915e-111b4587da81"];
  const currProjectConfigId = _.filter(project.configs, (v) => v.curr)[0].id;
  const projectConfig = projectConfigs[currProjectConfigId];
  const sectionConfigCol = sectionConfigCols[projectConfig.sectionConfigCol];

  return {
    codeInfo,
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
  };
}
