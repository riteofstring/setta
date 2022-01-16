import { useStoreState } from "easy-peasy";

export function useGroupedObjInfos(objInfos) {
  const allPackageInfo = useStoreState((x) => x.master.allPackageInfo);
  const allModuleInfo = useStoreState((x) => x.master.allModuleInfo);
  return _.groupBy(objInfos, (x) => {
    const { name: moduleName, parentId: packageId } = allModuleInfo[x.parentId];
    const { name: packageName, version } = allPackageInfo.children[packageId];
    return `${packageName}.${moduleName} v${version}`;
  });
}
