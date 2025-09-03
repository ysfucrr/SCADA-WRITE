"use client";

import { LogProvider } from '@/context/LogContext';

export default function SystemLogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LogProvider>{children}</LogProvider>;
}
