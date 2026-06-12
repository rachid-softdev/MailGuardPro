// ESLint flat config — Next.js 16 (next lint removed)
// Uses typescript-eslint for TS parsing + @next/eslint-plugin-next for Next.js rules
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default defineConfig([
  // Global ignores — skip generated / build output directories
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),

  // TypeScript recommended config (parser + rules)
  ...tseslint.configs.recommended,

  // React plugin — enable JSX support
  {
    ...reactPlugin.configs.flat?.recommended,
    ...reactPlugin.configs.flat?.["jsx-runtime"],
    settings: {
      react: { version: "detect" },
    },
  },

  // React Hooks plugin
  {
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: reactHooksPlugin.configs.recommended.rules,
  },

  // Next.js plugin config
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"]?.rules,

      // Relax rules that block practical patterns
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unescaped-entities": "off",
    },
  },
]);
