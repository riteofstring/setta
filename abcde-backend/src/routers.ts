import express from 'express';
import { login } from './auth/login';
import { logout } from './auth/logout';
import { register } from './auth/register';
import { loadAllUsersProjects } from './projects/projects';
export const router = express.Router();

router.post('/auth/login', login);
router.post('/auth/register', register);
router.post('/auth/logout', logout);
router.post('/projects', loadAllUsersProjects);
// router.post('/projects/load/:id/:configId', loadOne);
// router.post('/projects/save', save);
// router.post('/projects/createProject', createProject);
// router.post('/projects/saveAsNewProjectConfig', saveAsNewProjectConfig);
// router.post(
//   '/projects/saveAsExistingProjectConfig',
//   saveAsExistingProjectConfig,
// );
// router.post('/projects/getCollectionsAndModules', getCollectionsAndModules);
// router.post('/projects/getCollectionDetails', getCollectionDetails);
// router.post('/projects/generateCode', generateCode);
// router.post('/projects/getCode', getCode);
