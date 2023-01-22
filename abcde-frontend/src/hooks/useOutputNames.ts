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
