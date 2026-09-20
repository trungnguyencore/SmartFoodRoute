import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const base = env.VITE_BASE_PATH || "/";
  if (!/^\/(?:[^?#]*\/)?$/.test(base))
    throw new Error("VITE_BASE_PATH must start and end with /");
  return { plugins: [react(), tailwindcss()], base };
});
