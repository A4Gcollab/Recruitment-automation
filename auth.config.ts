import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no Node-only imports (bcrypt, db) live here.
// The credentials provider is added in `auth.ts` so middleware can stay edge-compatible.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 hours
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // Public surfaces:
      if (
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname === "/login" ||
        pathname === "/api/health"
      ) {
        return true;
      }

      const isApi = pathname.startsWith("/api/");
      const protectedPage =
        pathname.startsWith("/dashboard") || pathname.startsWith("/kanban");

      if (isApi || protectedPage) {
        return Boolean(auth?.user);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
