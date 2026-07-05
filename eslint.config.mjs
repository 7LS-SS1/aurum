import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "legacy/**",
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "dist/**",
      "public/embeds/**",
      "wordpress-theme/aurum-video/assets/player/**",
    ],
  },
];

export default eslintConfig;
