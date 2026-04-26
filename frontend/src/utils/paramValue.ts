import { CodeObjTypeEnum, type CodeObjType } from "utils/generatedTypes";

type RealtimeValueCheck = {
  previousValue: string;
  nextValue: string;
  codeObjType: CodeObjType;
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
