import { createAllInfo } from 'src/db/codeInfo/infoFactory';
import { getCodeInfo } from 'src/db/codeInfo/load';

export async function getCollectionDetails(req, res) {
  const results = createAllInfo(await getCodeInfo([req.body.codeInfoId]));
  res.json(results);
}
