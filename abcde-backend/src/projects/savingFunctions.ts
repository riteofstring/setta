import { returnNullNotUndefined } from '../utils/utils';
import _ = require('lodash');
import { EV } from '../entities/enteredValues/ev.entity';
import { createIfNotFound } from 'test/utils';

export async function persistEV(em, ev) {
  for (const v of _.values(ev)) {
    const x = await createIfNotFound(em, EV, { id: v.id });
    x.value = v.value ? v.value.toString() : null;
    x.child = returnNullNotUndefined(v.childId);
    em.persist(x);
  }
}
