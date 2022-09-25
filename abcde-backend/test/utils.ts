import s1 from '../../abcde-frontend/src/__tests__data/simpleTrainTest/Sections';
import s2 from '../../abcde-frontend/src/__tests__data/diffusionDrops/Sections';
import s3 from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/Sections';
import s1Children from '../../abcde-frontend/src/__tests__data/simpleTrainTest/SectionChildren';
import s2Children from '../../abcde-frontend/src/__tests__data/diffusionDrops/SectionChildren';
import s3Children from '../../abcde-frontend/src/__tests__data/appleOrchardFarm/SectionChildren';

// delete this and use mikro-orm upsert once it's available in newer version
export async function createIfNotFound(em, type, props) {
  let x = await em.findOne(type, props);
  if (!x) {
    x = em.create(type, props);
  }
  return x;
}

export function loadAllSections() {
  return { ...s1, ...s2, ...s3 };
}

export function loadAllSectionChildren() {
  return { ...s1Children, ...s2Children, ...s3Children };
}
