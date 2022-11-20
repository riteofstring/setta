import { createProject, getProjects } from "dbRequests/projects";
import { useStoreState } from "easy-peasy";

export function useGetProjects() {
  const access_token = useStoreState((x) => x.auth.access_token);
  return async () => {
    return await getProjects({ access_token });
  };
}

export function useCreateProject() {
  const access_token = useStoreState((x) => x.auth.access_token);
  return async ({ name }) => {
    return await createProject({ name, access_token });
  };
}
