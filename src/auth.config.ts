import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config — no Credentials provider, no
 * bcryptjs, no Prisma. This is what `middleware.ts` runs on every request
 * (Edge runtime), so it must only touch APIs Edge actually supports; it can
 * verify/decode the session JWT without ever needing the password hasher or
 * a database connection. The full config (auth.ts) extends this with the
 * actual provider for use in route handlers and Server Components.
 */
export default {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/admin/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = "role" in user ? user.role : "EDITOR";
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role ?? "EDITOR";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
