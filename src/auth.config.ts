import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config — no Credentials provider, no
 * bcryptjs, no Prisma. This is what `middleware.ts` runs on every request
 * (Edge runtime), so it must only touch APIs Edge actually supports; it can
 * verify/decode the session JWT without ever needing the password hasher or
 * a database connection. The full config (auth.ts) extends this with the
 * actual provider for use in route handlers and Server Components.
 */
function authSecrets() {
  const secrets = [process.env.AUTH_SECRET, process.env.AUTH_SECRET_PREVIOUS]
    .flatMap((value) => (value ? value.split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return secrets.length > 1 ? secrets : secrets[0];
}

export default {
  secret: authSecrets(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/admin/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = "role" in user ? user.role : "STAFF";
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role ?? "STAFF";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
