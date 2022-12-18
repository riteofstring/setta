import express from 'express';
import { login } from 'src/actions/auth/login';
import { logout } from 'src/actions/auth/logout';
import { register } from 'src/actions/auth/register';
import { generateCode } from 'src/actions/codeGenerator/generateCode';
import { getCode } from 'src/actions/codeGenerator/getCode';
import { getCollectionDetails } from 'src/actions/codeInfo/getCollectionDetails';
import { getCollectionsAndModules } from 'src/actions/codeInfo/getCollectionsAndModules';
import { createProject } from 'src/actions/projects/createProject';
import { loadAllUsersProjects } from 'src/actions/projects/loadAllUsersProjects';
import { loadOneProject } from 'src/actions/projects/loadOneProject';
import { saveAsExistingProjectConfig } from 'src/actions/projects/saveAsExistingProjectConfig';
import { saveAsNewProjectConfig } from 'src/actions/projects/saveAsNewProjectConfig';
import { saveProject } from 'src/actions/projects/saveProject';
export const router = express.Router();

router.post('/auth/login', login);
router.post('/auth/register', register);
router.post('/auth/logout', logout);
router.post('/projects', loadAllUsersProjects);
router.post('/projects/load/:id/:configId', loadOneProject);
router.post('/projects/save', saveProject);
router.post('/projects/createProject', createProject);
router.post('/projects/saveAsNewProjectConfig', saveAsNewProjectConfig);
router.post(
  '/projects/saveAsExistingProjectConfig',
  saveAsExistingProjectConfig,
);
router.post('/codeInfo/getCollectionsAndModules', getCollectionsAndModules);
router.post('/codeInfo/getCollectionDetails', getCollectionDetails);
router.post('/codeGenerator/generateCode', generateCode);
router.post('/codeGenerator/getCode', getCode);
