"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const isAdmin = session?.user?.role === "admin";
  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  
  const logout = async () => {
    await signOut({ redirect: false });
    router.push("/signin");
  };
  
  return {
    user: session?.user,
    isAdmin,
    isAuthenticated,
    isLoading,
    logout,
    // users/page.tsx dosyasında kullanılan özellikler
    session,
    status
  };
}
