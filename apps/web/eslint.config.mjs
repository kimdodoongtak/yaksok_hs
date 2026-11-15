import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    "design-previews/**",
    "design-backups/**",
    ".next/**",
    ".next-browser/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "coverage/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);
