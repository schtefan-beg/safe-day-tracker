import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // À adapter avant la première signature : l'appId ne doit plus changer ensuite.
  appId: "fr.safedaytracker.rythme",
  appName: "Rythme",
  webDir: "dist",
  server: { androidScheme: "https" },
};

export default config;
