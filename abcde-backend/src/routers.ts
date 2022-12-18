import express from 'express';
import { login } from './auth/login';
import { register } from './auth/register';
export const router = express.Router();

// // middleware that is specific to this router
// router.use((req, res, next) => {
//   console.log('Time: ', Date.now());
//   next();
// });
router.post('/auth/login', login);
router.post('/auth/register', register);
// router.get('/usersOnly', (req, res) => {
//   console.log('usersOnly req.isAuthenticated()', req.isAuthenticated());
//   res.send('usersOnly!');
// });

// router.post('/', verifyToken);
// router.post('/projects', getAllByOwner);
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
