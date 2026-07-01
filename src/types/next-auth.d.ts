import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "EDITOR";
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "EDITOR";
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: "ADMIN" | "EDITOR";
  }
}
