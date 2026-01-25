import { CodeObjTypeEnum } from "utils/generatedTypes";

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
