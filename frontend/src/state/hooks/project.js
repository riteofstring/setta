import _ from "lodash";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { dbSetProjectConfigName } from "requests/projectName";
import {
  dbGetAllProjectConfigMetadata,
  dbGetDefaultConfigName,
  dbLoadFullProject,
  dbLoadProjectConfigNames,
} from "requests/projects";
import {
  loadProjectConfig,
  loadSettingsProjectConfig,
} from "state/actions/project/loadProject";
import { setProjectConfigName } from "state/actions/project/projectConfig";
import { getProjectData } from "state/actions/project/saveProject";
import {
  useAllProjectConfigs,
  useMisc,
  useProjectConfig,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
  SETTINGS_PROJECT_NAME,
} from "utils/constants";
import { useHotReload } from "utils/hotReload";
import { useEditableOnSubmit } from "./editableText";

export function useGetAllProjectConfigMetadata() {
  const [projects, setProjects] = useState([]);
  async function getAllProjectConfigMetadata() {
    const res = await dbGetAllProjectConfigMetadata();
    if (res.status === 200) {
      setProjects(res.data);
    }
  }
  return { projects, getAllProjectConfigMetadata };
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
  function exportProjectJson() {
    const { project, ...theRest } = getProjectData({
      withArtifactMetadata: true,
    });
    setProjectJson(theRest);
  }
  async function exportFullProjectJson() {
    const res = await dbLoadFullProject({});
    if (res.status === 200) {
      setProjectJson(res.data);
    }
  }

  return { projectJson, exportProjectJson, exportFullProjectJson };
}

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
  const { pageDoneLoading, pageIs404 } = useMisc(
    (x) => _.pick(x, ["pageDoneLoading", "pageIs404"]),
    _.isEqual,
  );
  const isHotReload = useHotReload();
  console.log("pageDoneLoading, pageIs404", pageDoneLoading, pageIs404);

  async function loadFn() {
    console.log("LOADING ************");
    resetProjectStores();
    useMisc.setState({ pageDoneLoading: false });
    const res = await loadProjectConfig({ projectConfigName });
    useMisc.setState({
      pageDoneLoading: true,
      pageIsLoading: false,
      pageIs404: !res,
    });
  }

  async function loadSettingsProject() {
    console.log("LOADING ************");
    resetProjectStores();
    useMisc.setState({ pageDoneLoading: false });
    const res = await loadSettingsProjectConfig();
    useMisc.setState({
      pageDoneLoading: true,
      pageIsLoading: false,
      pageIs404: !res,
    });
  }

  function changeFn() {
    console.log("CHANGING CONFIG NAME********");
    setProjectConfigName(projectConfigName);
    useMisc.setState({ pageIsLoading: false });
  }

  useEffect(() => {
    useMisc.setState({ pageDoneLoading: false });
  }, []);

  useEffect(() => {
    if (isHotReload || useMisc.getState().pageIsLoading) {
      return;
    }

    useMisc.setState({ pageIsLoading: true });

    if (projectConfigName === SETTINGS_PROJECT_NAME) {
      loadSettingsProject();
    } else if (
      !pageDoneLoading ||
      pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG
    ) {
      loadFn();
    } else if (pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
      changeFn();
    }
  }, [pageLoadType, projectConfigName]);

  return [pageDoneLoading, pageIs404];
}

export function useEditableProjectName() {
  const name = useProjectConfig((x) => x.name);
  const navigate = useNavigate();
  async function condition(v) {
    const res = await dbSetProjectConfigName(v);
    return res.status === 200;
  }
  async function onSetName(v) {
    navigate(pathRelativeToProject(v), {
      state: { pageLoadType: PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME },
    });
  }

  return useEditableOnSubmit(name, onSetName, condition);
}

export function useConfigAddress({ project, configId }) {
  const configName = project.configs.find((x) => x.id === configId).name;
  return `${project.name}/${configName}`;
}

export function useLoadFullProject(previewEnabled) {
  const [doneLoading, setDoneLoading] = useState(false);
  const { projectConfigName: currProjectConfigName } = useParams();

  async function fullLoadFn() {
    setDoneLoading(false);
    const fullProjectRes = await dbLoadFullProject({
      excludeProjectConfigName: currProjectConfigName,
    });
    const nameRes = await dbLoadProjectConfigNames();
    if (fullProjectRes.status === 200 && nameRes.status === 200) {
      const nameToConfig = {};
      for (const p of fullProjectRes.data) {
        nameToConfig[p.projectConfig.name] = p;
      }
      useAllProjectConfigs.setState({
        x: nameToConfig,
        names: nameRes.data,
      });
      setDoneLoading(true);
    }
  }

  async function nameOnlyLoadFn() {
    setDoneLoading(false);
    const res = await dbLoadProjectConfigNames();
    if (res.status === 200) {
      useAllProjectConfigs.setState({
        x: {},
        names: res.data,
      });
      setDoneLoading(true);
    }
  }

  useEffect(() => {
    if (previewEnabled) {
      fullLoadFn();
    } else {
      nameOnlyLoadFn();
    }
  }, [previewEnabled, currProjectConfigName]);

  return { doneLoading, currProjectConfigName };
}

export function useDefaultConfigName() {
  const [defaultConfigName, setDefaultConfigName] = useState(null);

  async function fn() {
    const res = await dbGetDefaultConfigName();
    if (res.status === 200) {
      setDefaultConfigName(res.data);
    }
  }

  useEffect(() => {
    fn();
  }, []);

  return defaultConfigName;
}
