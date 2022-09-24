import baseUITypes from "__tests__data/BaseUITypes";
import presetUITypes from "__tests__data/PresetUITypes";
import codeInfo from "__tests__data/simpleTrainTest/CodeInfo";
import ev from "__tests__data/simpleTrainTest/EV";
import evCols from "__tests__data/simpleTrainTest/EVCols";
import globalDefaults from "__tests__data/simpleTrainTest/GlobalDefaults";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults";
import sectionChildren from "__tests__data/simpleTrainTest/SectionChildren";
import sections from "__tests__data/simpleTrainTest/Sections";
import uiTypes from "__tests__data/simpleTrainTest/UITypes";
import uiTypesCols from "__tests__data/simpleTrainTest/UITypesCols";

export function loadTestData() {
  return {
    codeInfo,
    globalDefaults,
    projectDefaults,
    sections,
    sectionChildren,
    ev,
    evCols,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    uiTypesCols,
  };
}
