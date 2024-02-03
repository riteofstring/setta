import { dbLoadFullProject } from "dbRequests/projects";
import _ from "lodash";
import { useOtherProjectConfigs } from "models/info/otherProjectConfigs";
import { loadProjectState } from "thunks/loadProjectState";

export async function loadProject({ projectName, configName }) {
  const res = await dbLoadFullProject({
    projectName,
    withBaseUITypes: true,
  });
  if (res.status === 200) {
    const projectConfig = res.data.configs.find(
      (x) => x.projectConfig.name === configName
    ).projectConfig;
    const configsMerged = _.merge(
      {},
      ...res.data.configs.map((x) => _.omit(x, ["projectConfig"]))
    );
    const projectState = {
      project: _.omit(res.data, ["configs"]),
      projectConfig,
      ...configsMerged,
    };
    useOtherProjectConfigs
      .getState()
      .setOtherConfigs(res.data.configs.map((x) => x.projectConfig));
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
