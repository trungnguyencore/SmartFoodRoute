import { z } from "zod";

const publicKey = z
  .string()
  .min(1)
  .refine((key) => {
    if (key.startsWith("sb_secret_")) return false;
    if (key.startsWith("sb_publishable_")) return true;
    try {
      const payload = key.split(".")[1];
      if (!payload) return false;
      const decoded: unknown = JSON.parse(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
      );
      return z.object({ role: z.literal("anon") }).safeParse(decoded).success;
    } catch {
      return false;
    }
  }, "Use a Supabase public/anon key only");

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
  VITE_APP_URL: z.url().default("http://localhost:5173"),
  VITE_DEPLOY_TARGET: z.enum(["vercel", "pages"]).default("vercel"),
  VITE_BASE_PATH: z
    .string()
    .regex(/^\/(?:[^?#]*\/)?$/)
    .default("/"),
});

export function parseEnv(input: Record<string, unknown>) {
  return schema.safeParse(input);
}
export const envResult = parseEnv(import.meta.env);
export const mapsConfig = {
  key: import.meta.env.VITE_MAPTILER_API_KEY as string | undefined,
};

export function appUrl(path: string) {
  if (!envResult.success) throw new Error("Application configuration missing");
  const env = envResult.data;
  const base = new URL(env.VITE_BASE_PATH, env.VITE_APP_URL);
  return env.VITE_DEPLOY_TARGET === "pages"
    ? base.href + "#" + path
    : new URL(path.replace(/^\//, ""), base).href;
}
