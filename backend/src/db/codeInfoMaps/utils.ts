import _ from 'lodash';

export function reshapeCodeInfoTypeMap(x) {
  return _.mapValues(_.keyBy(x, 'type'), (y) => ({ uiTypeId: y.uiTypeId }));
}
