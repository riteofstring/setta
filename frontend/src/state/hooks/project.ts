import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { loadProjectConfig } from "state/actions/project/loadProject";
import { getProjectDataForSaving } from "state/actions/project/saveProject";
import { useProjectLoading, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { PAGE_LOAD_TYPES } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_load_all_project_metadata,
  router_filter_data_for_json_export,
} from "utils/generatedEndpoints";
import { ProjectConfig } from "utils/generatedTypes";
import { useHotReload } from "utils/hotReload";

export function useGetAllProjectConfigMetadata() {
  const [projects, setProjects] = useState<Array<ProjectConfig>>([]);
  const [defaultProjectConfigId, setDefaultProjectConfigId] = useState<
    string | null
  >(null);
  async function getAllProjectConfigMetadata() {
    const res = await route_load_all_project_metadata();
    if (res200(res)) {
      const { projectMetadata, defaultProjectConfigId } = res.data;
      setProjects(projectMetadata);
      setDefaultProjectConfigId(defaultProjectConfigId);
    }
  }

  useEffect(() => {
    getAllProjectConfigMetadata();
  }, []);

  return { projects, defaultProjectConfigId, getAllProjectConfigMetadata };
}

export function useGetAllProjectConfigMetadataForFileMenu(open) {
  const { projects, getAllProjectConfigMetadata } =
    useGetAllProjectConfigMetadata();

  useEffect(() => {
    if (open) {
      getAllProjectConfigMetadata();
    }
  }, [open]);

  return projects;
}

export function useExportProjectJson() {
  const [projectJson, setProjectJson] = useState({});
  async function exportProjectJson() {
    const project = await getProjectDataForSaving();
    const res = await router_filter_data_for_json_export(project);
    if (res200(res)) {
      setProjectJson(res.data);
    }
  }

  return [projectJson, exportProjectJson];
}

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);
  const isHotReload = useHotReload();

  async function loadFn() {
    resetProjectStores();
    setDoneLoading(false);
    const res = await loadProjectConfig({ projectConfigName });
    setDoneLoading(true);
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: !res });
  }

  function changeFn() {
    if (!projectConfigName) {
      return;
    }
    useProjectState.setState((state) => {
      state.projectConfig.name = projectConfigName;
    });
    useProjectLoading.setState({
      projectIsLoading: false,
      projectIs404: false,
    });
  }

  useEffect(() => {
    if (isHotReload || useProjectLoading.getState().projectIsLoading) {
      return;
    }

    useProjectLoading.setState({ projectIsLoading: true });

    if (!doneLoading || pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG) {
      loadFn();
    } else if (pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
      changeFn();
    }
  }, [pageLoadType, projectConfigName]);

  return [doneLoading, is404];
}
