import { dbLoadProject } from "dbRequests/projects";
import { loadProjectState } from "thunks/loadProjectState";

// export async function loadProject({ projectName, configName }) {
//   const res = await dbLoadFullProject({
//     projectName,
//   });
//   if (res.status === 200) {
//     const config = res.data.configs.find(
//       (x) => x.projectConfig.name === configName
//     );
//     console.log("config", config)
//     const projectState = { project: _.omit(res.data, ["configs"]), ...config };
//     return loadProjectState(projectState);
//   } else {
//     return false;
//   }
// }

//old
export async function loadProject({ projectName, configName }) {
  const res = await dbLoadProject({
    projectName,
    configName,
  });
  if (res.status === 200) {
    return loadProjectState({ ...res.data });
  } else {
    return false;
  }
}
