import _ from "lodash";
import { getCodeObjImplLayering } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export function useNonPresetImplsForParam(
  sectionId: string,
  paramInfoId: string,
) {
  return useProjectState((x) => {
    const layering = getCodeObjImplLayering(x, paramInfoId, sectionId, null);
    const prevImpls: Record<string, string> = {};
    for (const i of layering.nonPresetImpls) {
      const impl = x.codeObjImpls[i];
      if (!impl) {
        throw new Error();
      }
      prevImpls[impl.type] = impl.id;
    }

    const output: Array<{ id: string; name: string }> = [];
    for (const c of Object.values(CodeObjTypeEnum)) {
      if (prevImpls[c]) {
        output.push({
          id: prevImpls[c],
          name: c,
        });
      } else {
        output.push({ id: c, name: c });
      }
    }
    return output;
  }, _.isEqual);
}
