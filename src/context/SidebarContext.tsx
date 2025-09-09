"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type SidebarContextType = {
  isExpanded: boolean;
  isMobileOpen: boolean;
  isMobile: boolean;
  isHovered: boolean;
  activeItem: string | null;
  openSubmenu: string | null;
  license: {valid:boolean,usedAnalyzers:number,maxDevices:number} | null;
  permissions: any | null;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setIsHovered: (isHovered: boolean) => void;
  setActiveItem: (item: string | null) => void;
  toggleSubmenu: (item: string) => void;
  setLicense: (license: {valid:boolean,usedAnalyzers:number,maxDevices:number} | null) => void;
  refetchPermissions: () => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [license, setLicense] = useState<{valid:boolean,usedAnalyzers:number,maxDevices:number} | null>(null);
  const [permissions, setPermissions] = useState<any | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(390);
  const router = useRouter();


 const fetchPermissions = () => {
   fetch('/api/users')
     .then(res => res.json())
     .then(data => {
       setPermissions(data.permissions);
     });
 };

 useEffect(() => {
   fetchPermissions();
 }, []);

  useEffect(() => {
    fetch('/api/license/validate')
      .then(res => res.json())
      .then(data => {
        console.log("data: ", data)
        if (!data.valid) {
          return router.replace('/no-license');
        }
        setLicense(data);
      });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const toggleSidebar = () => {
    setIsExpanded((prev) => !prev);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen((prev) => !prev);
  };

  const toggleSubmenu = (item: string) => {
    setOpenSubmenu((prev) => (prev === item ? null : item));
  };

  return (
    <SidebarContext.Provider
      value={{
        isExpanded: isMobile ? false : isExpanded,
        isMobile,
        isMobileOpen,
        isHovered,
        activeItem,
        openSubmenu,
        license,
        permissions,
        sidebarWidth,
        setSidebarWidth,
        toggleSidebar,
        toggleMobileSidebar,
        setIsHovered,
        setActiveItem,
        toggleSubmenu,
        setLicense,
       refetchPermissions: fetchPermissions,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};
