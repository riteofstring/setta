import { getAllUserSections } from 'src/db/sections/getAllUserSections';
import { getUserIdOrFail } from '../utils';

export async function mwGetSections(req, res) {
  const ownerId = getUserIdOrFail(req);
  const sections = await getAllUserSections(ownerId);
  res.json(sections);
}
