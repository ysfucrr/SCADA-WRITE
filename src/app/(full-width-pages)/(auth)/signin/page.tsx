"use client";
import { useEffect, useState } from "react";
import SignInForm from "@/components/auth/SignInForm";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const checkAdminExist = async () => {
    const response = await fetch('/api/initial-admin');
    const data = await response.json();
    console.log("has admin: ", data)
    if (!response.ok || data.hasAdmin === false) {
      router.push("/setup-admin");
    } else {
      router.push("/app-working");
    }
  }
  useEffect(() => {
    console.log("sign in page loaded")
    if (typeof window !== 'undefined' && window.electron?.isElectronEnvironment) {
      checkAdminExist();
    } else {
      setReady(true);
    }


  }, []);

  if (!ready) {
    return <div className="flex items-center justify-center h-screen text-gray-700">Yükleniyor...</div>;
  }

  return <SignInForm />;
}
