import express from 'express';
import { login } from 'src/middleware/auth/login';
import { logout } from 'src/middleware/auth/logout';
import { register } from 'src/middleware/auth/register';
import { generateCode } from 'src/middleware/codeGenerator/generateCode';
import { getCode } from 'src/middleware/codeGenerator/getCode';
import { getCollectionDetails } from 'src/middleware/codeInfo/getCollectionDetails';
import { getCollectionsAndModules } from 'src/middleware/codeInfo/getCollectionsAndModules';
import { createProject } from 'src/middleware/projects/createProject';
import { loadAllUsersProjects } from 'src/middleware/projects/loadAllUsersProjects';
import { loadOneProject } from 'src/middleware/projects/loadOneProject';
import { saveAsExistingProjectConfig } from 'src/middleware/projects/saveAsExistingProjectConfig';
import { saveAsNewProjectConfig } from 'src/middleware/projects/saveAsNewProjectConfig';
import { saveProject } from 'src/middleware/projects/saveProject';
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
