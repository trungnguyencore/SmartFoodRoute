import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "../../hooks/useAuth";
import { queryClient } from "../../lib/queryClient";
import {
  emptyCustomPlaceDraft,
  hasCustomPlaceDraft,
  saveCustomPlaceDraft,
} from "../../utils/customPlaceDraft";
const sdk = vi.hoisted(() => ({
  session: null as Session | null,
  level: "aal1",
  next: "aal2",
  listener: vi.fn<(event: AuthChangeEvent, session: Session | null) => void>(),
  unsubscribe: vi.fn(),
  fail: false,
}));
vi.mock("../../lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: sdk.session }, error: null }),
      onAuthStateChange: (listener: typeof sdk.listener) => {
        sdk.listener = listener;
        return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: sdk.level, nextLevel: sdk.next },
          error: sdk.fail ? new Error("fail") : null,
        }),
        listFactors: async () => ({
          data: { totp: sdk.next === "aal2" ? [{ id: "factor" }] : [] },
          error: null,
        }),
      },
      signOut: async () => {
        sdk.session = null;
        sdk.listener("SIGNED_OUT", null);
        return { error: null };
      },
      refreshSession: async () => ({
        error: new Error("test expired refresh token"),
      }),
    },
  }),
}));
function Consumer() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.loading ? "loading" : auth.error ? "error" : auth.access}</p>
      <button onClick={() => void auth.logout()}>logout</button>
    </>
  );
}
const session = {
  user: { id: "session-user" },
  access_token: "test-only",
} as Session;
beforeEach(() => {
  sdk.session = null;
  sdk.level = "aal1";
  sdk.next = "aal2";
  sdk.fail = false;
  queryClient.clear();
  sessionStorage.clear();
});
it("session lifecycle: sign-in → AAL1 → MFA → AAL2 → sign-out clears cached data", async () => {
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("signed-out");
  act(() => {
    sdk.session = session;
    sdk.listener("SIGNED_IN", session);
  });
  await screen.findByText("verify");
  act(() => {
    sdk.level = "aal2";
    sdk.listener("MFA_CHALLENGE_VERIFIED", session);
  });
  await screen.findByText("ready");
  queryClient.setQueryData(["private"], "private test data");
  saveCustomPlaceDraft({ ...emptyCustomPlaceDraft, name: "Nháp riêng" });
  expect(hasCustomPlaceDraft()).toBe(true);
  act(() => {
    sdk.session = null;
    sdk.listener("SIGNED_OUT", null);
  });
  await screen.findByText("signed-out");
  expect(queryClient.getQueryData(["private"])).toBeUndefined();
  expect(hasCustomPlaceDraft()).toBe(false);
});
it("assurance lookup failures never admit the dashboard", async () => {
  sdk.session = session;
  sdk.fail = true;
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("error");
  expect(screen.queryByText("ready")).not.toBeInTheDocument();
});
it("same-user token refresh keeps ready UI and private query cache mounted", async () => {
  sdk.session = session;
  sdk.level = "aal2";
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("ready");
  queryClient.setQueryData(["private"], "private test data");
  saveCustomPlaceDraft({ ...emptyCustomPlaceDraft, name: "Nháp cùng user" });
  act(() => {
    sdk.listener("TOKEN_REFRESHED", session);
  });
  expect(screen.getByText("ready")).toBeInTheDocument();
  expect(queryClient.getQueryData(["private"])).toBe("private test data");
  expect(hasCustomPlaceDraft()).toBe(true);
  await waitFor(() => expect(screen.getByText("ready")).toBeInTheDocument());
  expect(queryClient.getQueryData(["private"])).toBe("private test data");
  expect(hasCustomPlaceDraft()).toBe(true);
});

it("switching users clears a private place draft", async () => {
  sdk.session = session;
  sdk.level = "aal2";
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("ready");
  saveCustomPlaceDraft({ ...emptyCustomPlaceDraft, name: "Nháp user A" });
  const otherSession = {
    ...session,
    user: { ...session.user, id: "other-user" },
  } as Session;
  act(() => {
    sdk.listener("SIGNED_IN", otherSession);
  });
  expect(hasCustomPlaceDraft()).toBe(false);
  await screen.findByText("ready");
});

it("JWT downgrade after a token refresh closes private access", async () => {
  sdk.session = session;
  sdk.level = "aal2";
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("ready");
  act(() => {
    sdk.level = "aal1";
    sdk.listener("TOKEN_REFRESHED", session);
  });
  await screen.findByText("verify");
});
it("unsubscribes its session listener on unmount", async () => {
  const view = render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("signed-out");
  view.unmount();
  await waitFor(() => expect(sdk.unsubscribe).toHaveBeenCalled());
});
it("a removed live TOTP factor rejects a cached aal2 session", async () => {
  sdk.session = session;
  sdk.level = "aal2";
  sdk.next = "aal1";
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("enroll");
  expect(screen.queryByText("ready")).not.toBeInTheDocument();
});
it("expired sessions with failed refresh return to signed-out and clear cache", async () => {
  sdk.session = { ...session, expires_at: Math.floor(Date.now() / 1000) - 10 };
  sdk.level = "aal2";
  queryClient.setQueryData(["private"], "test secret");
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await screen.findByText("signed-out");
  expect(queryClient.getQueryData(["private"])).toBeUndefined();
});
