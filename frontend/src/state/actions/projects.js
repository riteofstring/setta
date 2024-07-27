import _ from "lodash";
import { dbLoadFullProject } from "requests/projects";
import { loadProjectState } from "state/actions/project/loadProject";
import { setOtherProjectConfigs } from "./otherProjectConfigs";

export async function loadProject({ projectName, configName }) {
  const res = await dbLoadFullProject({ projectName });
  if (res.status === 200) {
    const projectConfig = res.data.configs.find(
      (x) => x.projectConfig.name === configName,
    ).projectConfig;
    const configsMerged = _.merge(
      {},
      ...res.data.configs.map((x) => _.omit(x, ["projectConfig"])),
    );
    const projectState = {
      project: _.omit(res.data, ["configs"]),
      projectConfig,
      ...configsMerged,
    };
    setOtherProjectConfigs(res.data.configs.map((x) => x.projectConfig));
    return loadProjectState(projectState);
  } else {
    return false;
  }
}

// //old
// export async function loadProject({ projectName, configName }) {
//   const res = await dbLoadProject({
//     projectName,
//     configName,
//   });
//   if (res.status === 200) {
//     return loadProjectState({ ...res.data });
//   } else {
//     return false;
//   }
// }
