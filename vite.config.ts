import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// SPA statique : le build (dist/) est embarqué dans l'APK par Capacitor.
// Pas de SSR, pas de serveur, pas de service worker.
export default defineConfig({
  plugins: [
    // Doit rester avant le plugin React.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
