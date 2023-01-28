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
  SAVE_PROJECT,
} from 'abcde-utils/src/routes';
import express from 'express';
import { login } from 'src/middleware/auth/login';
import { logout } from 'src/middleware/auth/logout';
import { register } from 'src/middleware/auth/register';
import { generateCode } from 'src/middleware/codeGenerator/generateCode';
import { getCode } from 'src/middleware/codeGenerator/getCode';
import { getCollectionDetails } from 'src/middleware/codeInfo/getCollectionDetails';
import { getCollectionsAndModules } from 'src/middleware/codeInfo/getCollectionsAndModules';
import { logData } from 'src/middleware/logging/logging';
import { createProject } from 'src/middleware/projects/createProject';
import { loadAllUsersProjects } from 'src/middleware/projects/loadAllUsersProjects';
import { loadOneProject } from 'src/middleware/projects/loadOneProject';
import { saveAsExistingProjectConfig } from 'src/middleware/projects/saveAsExistingProjectConfig';
import { saveAsNewProjectConfig } from 'src/middleware/projects/saveAsNewProjectConfig';
import { saveProject } from 'src/middleware/projects/saveProject';

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
router.post(GET_COLLECTION_DETAILS, getCollectionDetails);
router.post(GENERATE_CODE, generateCode);
router.post(GET_CODE, getCode);
router.post('/logging', logData);
