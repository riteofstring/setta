import { prisma } from '../prisma';

export async function dbSetDarkMode({ userId, darkMode }) {
  return await prisma.user.update({
    where: { id: userId },
    data: { darkMode },
  });
}
