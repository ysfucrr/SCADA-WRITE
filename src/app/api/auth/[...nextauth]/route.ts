import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

// NextAuth handler fonksiyonlarını export et
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
