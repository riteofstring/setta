import { NO_AUTH } from "utils/constants";
import { noAuthGetSectionList } from "./noAuth/sections";

export async function dbGetSectionList() {
  if (NO_AUTH) {
    return await noAuthGetSectionList();
  }

  // return await post({
  //   body: {},
  //   address: SECTIONS,
  //   withCredentials: true,
  // });
}

export async function dbLoadSection(sectionId) {
    // if (NO_AUTH) {
    //     return await noAuthLoadProject({ projectName, configName });
    //   }
    
    //   return await post({
    //     body: {},
    //     address: LOAD_PROJECT({ username, projectName, configName }),
    //     withCredentials: true,
    //   });
    // }
    
}
