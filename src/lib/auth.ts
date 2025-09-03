// Next.js API route'larında kullanmak için authOptions'ı export ediyoruz
export { authOptions } from "@/lib/auth-options";

// Yardımcı fonksiyonlar
export function isAdmin(session: any) {
  return session?.user?.role === "admin";
}
