"use client"
import AnimatedBackground from "@/components/auth/AnimatedBackground";
import Cubes from "@/components/auth/Cubes/Cubes";
import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { ThemeProvider } from "@/context/ThemeContext";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import ParticleNetwork from "@/components/auth/ParticleNetwork";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Doküman üzerinden tema durumunu kontrol ediyoruz
  const [currentTheme, setCurrentTheme] = useState<string>("light");

  // Tema değişikliklerini izlemek için MutationObserver kullanıyoruz
  useEffect(() => {
    // İlk yükleme için tema durumunu kontrol et
    const isDark = document.documentElement.classList.contains("dark");
    setCurrentTheme(isDark ? "dark" : "light");

    // Tema değişikliklerini izlemek için bir MutationObserver oluştur
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.attributeName === "class" &&
          mutation.target === document.documentElement
        ) {
          const isDark = document.documentElement.classList.contains("dark");
          setCurrentTheme(isDark ? "dark" : "light");
        }
      });
    });

    // HTML elementini izlemeye başla
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Cleanup
    return () => observer.disconnect();
  }, []);

  //console.log("Mevcut tema:", currentTheme);

  return (
    <ThemeProvider>
      <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
        <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col dark:bg-gray-900 sm:p-0">
          <ParticleNetwork 
            particleCount={200}
            maxDist={120}
            backgroundColor={currentTheme === "dark" ? "#000000" : "#ffffff"}
            pointColor="#26b6d9"
          />
          {children}
         
          <div className="fixed bottom-6 right-6 hidden sm:block z-9999">
            <ThemeTogglerTwo />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
