import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateStaff } from "@/lib/staff-login";
import authConfig from "@/auth.config";

// Full config — Node.js only (route handlers, Server Components). Never
// imported from middleware.ts; see auth.config.ts for the Edge-safe subset.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: authenticateStaff,
    }),
  ],
});
