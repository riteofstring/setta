import express from 'express';
import { login } from './auth/login';
import { logout } from './auth/logout';
import { register } from './auth/register';
import { createProject } from './projects/createProject';
import { loadAllUsersProjects } from './projects/loadAllUsersProjects';
import { loadOneProject } from './projects/loadOneProject';
import { saveProject } from './projects/saveProject';
export const router = express.Router();

router.post('/auth/login', login);
router.post('/auth/register', register);
router.post('/auth/logout', logout);
router.post('/projects', loadAllUsersProjects);
router.post('/projects/load/:id/:configId', loadOneProject);
router.post('/projects/save', saveProject);
router.post('/projects/createProject', createProject);
// router.post('/projects/saveAsNewProjectConfig', saveAsNewProjectConfig);
// router.post(
//   '/projects/saveAsExistingProjectConfig',
//   saveAsExistingProjectConfig,
// );
// router.post('/projects/getCollectionsAndModules', getCollectionsAndModules);
// router.post('/projects/getCollectionDetails', getCollectionDetails);
// router.post('/projects/generateCode', generateCode);
// router.post('/projects/getCode', getCode);
