import { createContext, useContext, type ReactNode } from "react";
import type { ParamDuplicateIndex } from "state/actions/params/paramDuplicateIndex";

const emptyIndex: ParamDuplicateIndex = {
  parentById: {},
  namesByParent: {},
};

const ParamDuplicateIndexContext =
  createContext<ParamDuplicateIndex>(emptyIndex);

export function ParamDuplicateIndexProvider({
  value,
  children,
}: {
  value: ParamDuplicateIndex;
  children: ReactNode;
}) {
  return (
    <ParamDuplicateIndexContext.Provider value={value}>
      {children}
    </ParamDuplicateIndexContext.Provider>
  );
}

export function useParamDuplicateIndex(): ParamDuplicateIndex {
  return useContext(ParamDuplicateIndexContext);
}
