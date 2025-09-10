"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import React from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen, isMobile, sidebarWidth } = useSidebar();

  const mainContentStyle = {
    transition: 'margin-left 300ms ease-in-out',
    marginLeft: (isMobile && !isMobileOpen) ? '0px' : isMobileOpen ? '0px' : isExpanded || isHovered ? `${sidebarWidth}px` : '90px'
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar and Backdrop */}
      <AppSidebar />
      <Backdrop />
      {/* Main Content Area */}
      <div
        style={mainContentStyle}
        className={`flex-1`}
      >
        {/* Header */}
        <AppHeader />
        {/* Page Content */}
        <div className="p-4 mx-auto max-w-screen-2xl md:p-6">{children}</div>
      </div>
    </div>
  );
}
