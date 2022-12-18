import { createAllInfo } from './infoFactory';
import { getCodeInfo } from './load';

export async function getCollectionDetails(req, res) {
  const results = createAllInfo(await getCodeInfo([req.body.codeInfoId]));
  res.json(results).status(200);
}
