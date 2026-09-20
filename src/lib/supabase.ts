import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envResult } from "./env";

let client: SupabaseClient | undefined;
export function getSupabase() {
  if (!envResult.success)
    throw new Error("Thiếu cấu hình Supabase. Xem .env.example.");
  client ??= createClient(
    envResult.data.VITE_SUPABASE_URL,
    envResult.data.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  return client;
}
