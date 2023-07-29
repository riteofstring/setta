import {
  CREATE_PROJECT,
  GENERATE_CODE,
  GET_CODE,
  GET_COLLECTIONS_AND_MODULES,
  GET_COLLECTION_DETAILS,
  LOAD_PROJECT,
  LOGIN,
  LOGOUT,
  PROJECTS,
  REGISTER,
  SAVE_AS_EXISTING_PROJECT_CONFIG,
  SAVE_AS_NEW_PROJECT_CONFIG,
  SAVE_COLLECTIONS,
  SAVE_PROJECT,
  SET_DARK_MODE,
  SET_PROJECT_CONFIG_NAME,
  SET_PROJECT_NAME,
} from 'abcde-utils/src/routes';
import express from 'express';
import { login } from 'src/middleware/auth/login';
import { logout } from 'src/middleware/auth/logout';
import { register } from 'src/middleware/auth/register';
import { getCollectionDetails } from 'src/middleware/codeInfo/getCollectionDetails';
import { getCollectionsAndModules } from 'src/middleware/codeInfo/getCollectionsAndModules';
import { saveCollections } from 'src/middleware/codeInfo/saveCollections';
import { logData } from 'src/middleware/logging/logging';
import { createProject } from 'src/middleware/projects/createProject';
import { loadAllUsersProjects } from 'src/middleware/projects/loadAllUsersProjects';
import { loadOneProject } from 'src/middleware/projects/loadOneProject';
import { saveAsExistingProjectConfig } from 'src/middleware/projects/saveAsExistingProjectConfig';
import { saveAsNewProjectConfig } from 'src/middleware/projects/saveAsNewProjectConfig';
import { saveProject } from 'src/middleware/projects/saveProject';
import { setProjectConfigName } from 'src/middleware/projects/setProjectConfigName';
import { setProjectName } from 'src/middleware/projects/setProjectName';
import { generateCode } from 'src/middleware/runs/generateCode';
import { getCode } from 'src/middleware/runs/getCode';
import { setDarkMode } from 'src/middleware/user/setDarkMode';

export const router = express.Router();

router.post(LOGIN, login);
router.post(REGISTER, register);
router.post(LOGOUT, logout);
router.post(PROJECTS, loadAllUsersProjects);
router.post(
  LOAD_PROJECT({
    username: ':username',
    projectName: ':projectName',
    configName: ':configName',
  }),
  loadOneProject,
);
router.post(SAVE_PROJECT, saveProject);
router.post(CREATE_PROJECT, createProject);
router.post(SAVE_AS_NEW_PROJECT_CONFIG, saveAsNewProjectConfig);
router.post(SAVE_AS_EXISTING_PROJECT_CONFIG, saveAsExistingProjectConfig);
router.post(GET_COLLECTIONS_AND_MODULES, getCollectionsAndModules);
router.post(SAVE_COLLECTIONS, saveCollections);
router.post(GET_COLLECTION_DETAILS, getCollectionDetails);
router.post(GENERATE_CODE, generateCode);
router.post(GET_CODE, getCode);
router.post(SET_PROJECT_NAME, setProjectName);
router.post(SET_PROJECT_CONFIG_NAME, setProjectConfigName);
router.post(SET_DARK_MODE, setDarkMode);
router.post('/logging', logData);
