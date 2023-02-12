import _ from "lodash";
import { useOutputGroups } from "models/info/outputGroups";
import { useOutputs } from "models/info/outputs";

function useOutputNamesHelper(groupFilter) {
  const outputNames = useOutputs(
    (x) => _.mapValues(x.x, (output) => output.name),
    _.isEqual
  );

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

export function useAllOutputNames() {
  return useOutputNamesHelper((x) => x);
}

export function useOutputNames(groupId) {
  const groupFilter = groupId ? (x) => _.pick(x, [groupId]) : () => ({});
  return useOutputNamesHelper(groupFilter);
}

export function useOutputValues(groupId) {
  const group = useOutputGroups((x) => x.x[groupId], _.isEqual);
  const children = groupId ? group.children : [];
  const childrenOutputs = useOutputs(
    (x) =>
      _.keyBy(
        children.map((c) => x.x[c]),
        "id"
      ),
    _.isEqual
  );

  if (!groupId) {
    return null;
  }

  return { ...group, children: children.map((c) => childrenOutputs[c]) };
}
