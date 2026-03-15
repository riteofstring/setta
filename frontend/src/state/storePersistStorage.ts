import { createJSONStorage } from "zustand/middleware";

const createInMemoryStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => {
      storage.set(name, value);
    },
    removeItem: (name: string) => {
      storage.delete(name);
    },
  };
};

export const getPersistStorage = <S>() =>
  createJSONStorage<S>(() => {
    if (typeof localStorage === "undefined") {
      return createInMemoryStorage();
    }
    if (
      typeof localStorage.getItem !== "function" ||
      typeof localStorage.setItem !== "function" ||
      typeof localStorage.removeItem !== "function"
    ) {
      return createInMemoryStorage();
    }
    return localStorage;
  });
