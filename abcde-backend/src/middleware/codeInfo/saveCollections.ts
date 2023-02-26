import { saveCodeInfo } from 'src/db/codeInfo/save';

export async function saveCollections(req, res) {
  const upsert = true;
  await saveCodeInfo(req.body.collections, upsert);
  res.sendStatus(200);
}
