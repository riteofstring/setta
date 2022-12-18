import crypto from 'crypto';

export function createSalt() {
  return crypto.randomBytes(16);
}

export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
}

export function getSaltAndHash(password: string) {
  const salt = createSalt();
  return { salt, password: hashPassword(password, salt) };
}
