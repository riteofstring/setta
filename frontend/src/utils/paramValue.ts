import { CodeObjTypeEnum } from "utils/generatedTypes";
export { shouldShowPasswordReveal } from "../../plugin-sdk/app-subsystem/src/paramValue";

type RealtimeValueCheck = {
  previousValue: string;
  nextValue: string;
  codeObjType: CodeObjTypeEnum;
};

export function shouldEmitRealtimeValue({
  previousValue,
  nextValue,
  codeObjType,
}: RealtimeValueCheck): boolean {
  if (previousValue === nextValue) {
    return false;
  }
  return codeObjType !== CodeObjTypeEnum.PasswordParam;
}
