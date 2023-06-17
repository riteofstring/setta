import { NO_AUTH } from "utils/constants";
import {
  dbNoAuthSetProjectConfigName,
  dbNoAuthSetProjectName,
} from "./noAuth/projectName";

export async function dbSetProjectName() {
  if (NO_AUTH) {
    return dbNoAuthSetProjectName();
  }

  // return post({
  //   body: {},
  //   address: PROJECTS,
  //   thenFn: (res) => res.data,
  //   catchFn: () => [],
  //   withCredentials: true,
  // });
}

export async function dbSetProjectConfigName() {
  if (NO_AUTH) {
    return dbNoAuthSetProjectConfigName();
  }

  // return post({
  //   body: {},
  //   address: PROJECTS,
  //   thenFn: (res) => res.data,
  //   catchFn: () => [],
  //   withCredentials: true,
  // });
}
