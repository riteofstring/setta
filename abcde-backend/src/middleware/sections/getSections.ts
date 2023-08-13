import { getAllUserSections } from 'src/db/sections/getAllUserSections';
import { loadSections } from 'src/db/sections/loadSections';
import { getUserIdOrFail } from '../utils';

export async function mwGetSections(req, res) {
  const ownerId = getUserIdOrFail(req);
  let data;
  if (req.body.sectionId) {
    data = await loadSections([req.body.sectionId]);
  } else {
    data = await getAllUserSections(ownerId);
  }

  res.json(data);
}
