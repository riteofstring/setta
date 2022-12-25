import _ from 'lodash';

export function reshapeCodeInfoMap(x) {
  return _.mapValues(_.keyBy(x, 'codeInfoId'), (y) => ({
    uiTypeId: y.uiTypeId,
  }));
}

export function reshapeCodeInfoTypeMap(x) {
  return _.mapValues(_.keyBy(x, 'type'), (y) => ({ uiTypeId: y.uiTypeId }));
}
