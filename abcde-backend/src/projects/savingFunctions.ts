import { returnNullNotUndefined } from '../utils/utils';
import _ = require('lodash');
import { EV } from '../entities/enteredValues/ev.entity';
import { createIfNotFound } from 'test/utils';
import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';
import { EVCols } from '../entities/enteredValues/evCols.entity';
import { Sections } from '../entities/sections/sections.entity';

export async function persistEV(em, ev) {
  for (const v of _.values(ev)) {
    const x = await createIfNotFound(em, EV, { id: v.id });
    x.value = v.value ? v.value.toString() : null;
    x.child = returnNullNotUndefined(v.childId);
    em.persist(x);
  }
}

export async function persistEVCols(em, evCols) {
  for (const evColId of _.keys(evCols)) {
    const x = await createIfNotFound(em, EVColsIds, { id: evColId });
    for (const codeInfoId of _.keys(evCols[evColId])) {
      const y = await createIfNotFound(em, EVCols, {
        id: evColId,
        codeInfo: codeInfoId,
      });
      y.enteredValue = evCols[evColId][codeInfoId];
      em.persist(y);
    }
    em.persist(x);
  }
}

export async function persistSections(em, sections, sectionChildren) {
  const persisted = {};
  for (const v of _.values(sections)) {
    const x = await createIfNotFound(em, Sections, { id: v.id });
    em.assign(x, {
      name: v.name,
      paramInfo: v.paramInfoId,
    });
    em.persist(x);
    persisted[x.id] = x;
  }
  for (const sid of _.keys(sectionChildren)) {
    em.assign(persisted[sid], {
      children: sectionChildren[sid],
    });
  }
}
