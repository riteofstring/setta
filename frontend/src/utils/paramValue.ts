import { CodeObjTypeEnum } from "utils/generatedTypes";

type RealtimeValueCheck = {
  previousValue: string;
  nextValue: string;
  codeObjType: CodeObjTypeEnum;
};

type PasswordRevealCheck = {
  value: string;
  hasSecret: boolean;
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

export function shouldShowPasswordReveal({
  value,
  hasSecret,
}: PasswordRevealCheck): boolean {
  return hasSecret && value === "";
}
