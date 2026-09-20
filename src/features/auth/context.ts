import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Access } from "./authState";
export interface AuthState {
  session: Session | null;
  access: Access;
  loading: boolean;
  error: string | null;
  recovery: boolean;
}
export const AuthContext = createContext<
  | (AuthState & {
      refresh: () => Promise<void>;
      logout: () => Promise<void>;
      finishRecovery: () => void;
    })
  | null
>(null);
