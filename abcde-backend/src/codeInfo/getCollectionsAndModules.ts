import { getCollectionsAndModules as getCollectionsAndModulesFn } from './load';

export async function getCollectionsAndModules(req, res) {
  const results = await getCollectionsAndModulesFn(req.body.searchTerm);
  res.json(results).status(200);
}
