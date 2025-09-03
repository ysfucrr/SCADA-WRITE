import React, { createContext, useState, useContext, ReactNode } from 'react';

interface DnDContextType {
  nodeType: string | null;
  setNodeType: (type: string | null) => void;
}

const DnDContext = createContext<DnDContextType | undefined>(undefined);

export function DnDProvider({ children }: { children: ReactNode }) {
  const [nodeType, setNodeType] = useState<string | null>(null);

  return (
    <DnDContext.Provider value={{ nodeType, setNodeType }}>
      {children}
    </DnDContext.Provider>
  );
}

export function useDnD() {
  const context = useContext(DnDContext);
  
  if (context === undefined) {
    throw new Error('useDnD must be used within a DnDProvider');
  }
  
  return context;
}
