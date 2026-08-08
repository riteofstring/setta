type PasswordRevealCheck = {
  value: string;
  hasSecret: boolean;
};

export function shouldShowPasswordReveal({
  value,
  hasSecret,
}: PasswordRevealCheck): boolean {
  return hasSecret && value === "";
}
