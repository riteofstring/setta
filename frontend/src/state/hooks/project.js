import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  dbFilterDataForJSONExport,
  dbLoadAllProjectMetadata,
} from "requests/projects";
import {
  loadProjectConfig,
  loadSettingsProjectConfig,
} from "state/actions/project/loadProject";
import { getProjectDataForSaving } from "state/actions/project/saveProject";
import { useProjectLoading, useProjectState } from "state/definitions";
import { resetStores } from "state/utils";
import { PAGE_LOAD_TYPES, SETTINGS_PROJECT_NAME } from "utils/constants";
import { useHotReload } from "utils/hotReload";

export function useGetAllProjectConfigMetadata() {
  const [projects, setProjects] = useState([]);
  const [defaultProjectConfigId, setDefaultProjectConfigId] = useState(null);
  async function getAllProjectConfigMetadata() {
    const res = await dbLoadAllProjectMetadata();
    if (res.status === 200) {
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
    const res = await dbFilterDataForJSONExport(project);
    if (res.status === 200) {
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
    resetStores();
    setDoneLoading(false);
    const res = await loadProjectConfig({ projectConfigName });
    setDoneLoading(true);
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: !res });
  }

  async function loadSettingsProject() {
    resetStores();
    setDoneLoading(false);
    const res = await loadSettingsProjectConfig();
    setDoneLoading(true);
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: !res });
  }

  function changeFn() {
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

    if (projectConfigName === SETTINGS_PROJECT_NAME) {
      loadSettingsProject();
    } else if (
      !doneLoading ||
      pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG
    ) {
      loadFn();
    } else if (pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
      changeFn();
    }
  }, [pageLoadType, projectConfigName]);

  return [doneLoading, is404];
}
