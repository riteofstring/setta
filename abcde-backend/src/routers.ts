import express from 'express';
import { login } from './auth/login';
import { logout } from './auth/logout';
import { register } from './auth/register';
import { generateCode } from './codeGenerator/generateCode';
import { getCode } from './codeGenerator/getCode';
import { getCollectionDetails } from './codeInfo/getCollectionDetails';
import { getCollectionsAndModules } from './codeInfo/getCollectionsAndModules';
import { createProject } from './projects/createProject';
import { loadAllUsersProjects } from './projects/loadAllUsersProjects';
import { loadOneProject } from './projects/loadOneProject';
import { saveAsExistingProjectConfig } from './projects/saveAsExistingProjectConfig';
import { saveAsNewProjectConfig } from './projects/saveAsNewProjectConfig';
import { saveProject } from './projects/saveProject';
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
