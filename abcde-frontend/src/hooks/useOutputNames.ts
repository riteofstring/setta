import _ from "lodash";
import { useOutputGroups } from "models/info/outputGroups";
import { useOutputs } from "models/info/outputs";

export function useOutputNames(groupIds = null) {
  const outputNames = useOutputs(
    (x) => _.mapValues(x.x, (output) => output.name),
    _.isEqual
  );

  const groupFilter = groupIds ? (x) => _.pick(x, groupIds) : (x) => x;

  const groups = useOutputGroups(
    (x) =>
      _.mapValues(groupFilter(x.x), (group) => ({
        id: group.id,
        name: group.name,
        children: _.map(group.children, (c) => outputNames[c]),
      })),
    _.isEqual
  );

  return groups;
}

export function useOutputValues(groupIds) {
  const groups = useOutputGroups((x) => _.pick(x.x, groupIds), _.isEqual);
  const childrenIds = ([] as string[]).concat(
    ..._.map(groups, (x) => x.children)
  );
  const children = useOutputs(
    (x) =>
      _.keyBy(
        childrenIds.map((c) => x.x[c]),
        "id"
      ),
    _.isEqual
  );
  return _.mapValues(groups, (x) => ({
    ...x,
    children: x.children.map((c) => children[c]),
  }));
}
