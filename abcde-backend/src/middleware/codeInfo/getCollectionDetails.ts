import { getCodeInfo } from 'src/db/codeInfo/load';

export async function getCollectionDetails(req, res) {
  const allCodeInfo = await getCodeInfo([req.body.codeInfoId]);
  res.json({ allCodeInfo });
}
