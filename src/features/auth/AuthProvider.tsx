import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "../../lib/supabase";
import { queryClient } from "../../lib/queryClient";
import { AuthContext, type AuthState } from "./context";
import { decideAccess } from "./authState";
import { clearCustomPlaceDraft } from "../../utils/customPlaceDraft";

const initial: AuthState = {
  session: null,
  access: "signed-out",
  loading: true,
  error: null,
  recovery: false,
};
export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(initial);
  const stateRef = useRef<AuthState>(initial);
  const generation = useRef(0);
  const invalidate = useCallback(() => ++generation.current, []);
  const mounted = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const resolve = useCallback(
    async (session: Session | null, ticket: number) => {
      try {
        let access = decideAccess(false, null, null);
        if (session) {
          const { data, error } =
            await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
          if (error) throw error;
          // Check live factors as cached session.user may retain a removed factor.
          const factors = await getSupabase().auth.mfa.listFactors();
          if (factors.error) throw factors.error;
          access = decideAccess(
            true,
            data.currentLevel,
            factors.data.totp.length ? "aal2" : "aal1",
          );
          if (access === "signed-out")
            throw new Error("Unrecognized session assurance");
        }
        if (mounted.current && ticket === generation.current) {
          if (access !== "ready") queryClient.clear();
          setState((old) => ({
            ...old,
            session,
            access,
            loading: false,
            error: null,
          }));
        }
      } catch {
        if (mounted.current && ticket === generation.current) {
          queryClient.clear();
          setState((old) => ({
            ...old,
            session,
            access: "signed-out",
            loading: false,
            error:
              "Không xác minh được phiên đăng nhập. Hãy thử lại hoặc đăng xuất.",
          }));
        }
      }
    },
    [],
  );
  const refresh = useCallback(async () => {
    const ticket = invalidate();
    setState((old) => ({ ...old, loading: true, access: "signed-out" }));
    const { data, error } = await getSupabase().auth.getSession();
    if (error) {
      if (ticket === generation.current)
        setState({
          ...initial,
          loading: false,
          error: "Phiên đã hết hạn. Hãy đăng nhập lại.",
        });
      return;
    }
    await resolve(data.session, ticket);
  }, [resolve, invalidate]);
  const logout = useCallback(async () => {
    invalidate();
    clearCustomPlaceDraft();
    await queryClient.cancelQueries();
    queryClient.clear();
    setState({ ...initial, loading: false });
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
    if (error)
      setState((old) => ({
        ...old,
        error: "Đăng xuất chưa hoàn tất. Vui lòng thử lại.",
      }));
  }, [invalidate]);
  useEffect(() => {
    mounted.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      const ticket = invalidate();
      const previous = stateRef.current;
      const sameReadyUser =
        !!session &&
        previous.access === "ready" &&
        previous.session?.user.id === session.user.id;
      const preserveReady =
        sameReadyUser &&
        (event === "TOKEN_REFRESHED" ||
          event === "SIGNED_IN" ||
          event === "USER_UPDATED" ||
          event === "MFA_CHALLENGE_VERIFIED");
      const userChanged =
        !!previous.session?.user.id &&
        previous.session.user.id !== session?.user.id;
      if (event === "SIGNED_OUT" || userChanged) clearCustomPlaceDraft();

      // Never await an Auth method while Supabase's session lock is held.
      // Routine same-user refresh events keep private UI mounted while AAL2
      // is revalidated in the deferred resolve() call below.
      if (!preserveReady) queryClient.clear();
      setState((old) => ({
        ...old,
        session,
        access: preserveReady ? "ready" : "signed-out",
        loading: !preserveReady,
        error: null,
        recovery:
          event === "PASSWORD_RECOVERY" ||
          (event !== "SIGNED_OUT" && old.recovery),
      }));
      const timer = setTimeout(() => {
        timers.delete(timer);
        void resolve(session, ticket);
      }, 0);
      timers.add(timer);
    });
    void refresh();
    return () => {
      mounted.current = false;
      invalidate();
      data.subscription.unsubscribe();
      timers.forEach(clearTimeout);
      queryClient.clear();
    };
  }, [refresh, resolve, invalidate]);
  useEffect(() => {
    const expiry = state.session?.expires_at;
    if (!expiry) return;
    const timer = setTimeout(
      () => {
        void getSupabase()
          .auth.refreshSession()
          .then(({ error }) => {
            if (error) void logout();
          })
          .catch(() => void logout());
      },
      Math.max(0, expiry * 1000 - Date.now() - 30_000),
    );
    return () => clearTimeout(timer);
  }, [state.session?.expires_at, logout]);
  return (
    <AuthContext.Provider
      value={{
        ...state,
        refresh,
        logout,
        finishRecovery: () => setState((old) => ({ ...old, recovery: false })),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
