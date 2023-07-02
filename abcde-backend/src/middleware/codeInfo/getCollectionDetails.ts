import { createAllInfo } from 'src/db/codeInfo/infoFactory';
import { getCodeInfo } from 'src/db/codeInfo/load';

export async function getCollectionDetails(req, res) {
  const codeInfo = await getCodeInfo([req.body.codeInfoId]);
  const results = createAllInfo(codeInfo);
  res.json(results);
}
