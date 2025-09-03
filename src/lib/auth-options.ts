import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";
import clientPromise from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        try {
          console.log("MongoDB bağlantısı kuruluyor...");
          
          // Doğrudan MongoClient kullanarak bağlantı kur
          const uri = process.env.MONGODB_URI!;
          const directClient = new MongoClient(uri);
          await directClient.connect();
          
          console.log("Client doğrudan bağlandı");
          const db = directClient.db("scada_dashboard");
          console.log("MongoDB bağlantısı başarılı, veritabanı:", !!db);
          
          const user = await db.collection("users").findOne({ 
            username: credentials.username 
          });
          
          console.log("Kullanıcı bulundu mu:", !!user);

          if (!user) {
            console.log("User not found");
            return null;
          }

          console.log("Girilen şifre:", credentials.password);
          console.log("Veritabanındaki hash:", user.password);
          
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );
          
          console.log("Şifre doğrulama sonucu:", isPasswordValid);

          if (!isPasswordValid) {
            console.log("Password is incorrect");
            return null;
          }

          return {
            id: user._id.toString(),
            username: user.username, 
            name: user.username, 
            role: user.role,
            permissions: user.permissions || (user.role === 'admin' ? {
              dashboard: true,
              users: true,
              units: true,
              trendLog: true
            } : {
              dashboard: false,
              users: false,
              units: false,
              trendLog: false
            }), 
            buildingPermissions: user.buildingPermissions
          };
        } catch (error) {
          console.error("Authentication error:", error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    jwt: ({ token, user }: { token: any; user: any }) => {
      if (user) {
        console.log("user: ", user)
        token.id = user.id;
        token.role = user.role;
        token.permissions = user.permissions;
        token.buildingPermissions = user.buildingPermissions;
      }
      return token;
    },
    session: ({ session, token }: { session: any; token: any }) => {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.permissions = token.permissions;
        session.user.buildingPermissions = token.buildingPermissions;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: { 
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 gün
  },
  secret: process.env.NEXTAUTH_SECRET
};
