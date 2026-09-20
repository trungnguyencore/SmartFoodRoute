import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthContext, type AuthState } from "./context";
import { decideAccess } from "./authState";
import { AuthGuard } from "../../app/guards/AuthGuard";
import { MfaGuard } from "../../app/guards/MfaGuard";
import { VerifyTotp } from "../../components/auth/VerifyTotp";
import { EnrollTotp } from "../../components/auth/EnrollTotp";

const fake = vi.hoisted(() => ({
  verify: vi.fn(),
  enroll: vi.fn(),
  list: vi.fn(),
  unenroll: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      mfa: {
        challengeAndVerify: fake.verify,
        enroll: fake.enroll,
        listFactors: fake.list,
        unenroll: fake.unenroll,
      },
    },
  }),
}));
const session = { user: { id: "test-user" } } as Session;
const state: AuthState = {
  session,
  access: "ready",
  loading: false,
  error: null,
  recovery: false,
};
function context(overrides: Partial<AuthState> = {}) {
  return {
    ...state,
    ...overrides,
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    finishRecovery: vi.fn(),
  };
}
beforeEach(() => {
  fake.verify.mockResolvedValue({ data: {}, error: null });
  fake.list.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
  fake.enroll.mockResolvedValue({
    data: {
      id: "new-factor",
      totp: { uri: "otpauth://totp/test?secret=TEST", secret: "TEST" },
    },
    error: null,
  });
  fake.unenroll.mockResolvedValue({ error: null });
});
describe("auth assurance decision", () => {
  it.each([
    [false, null, null, "signed-out"],
    [true, "aal1", "aal1", "enroll"],
    [true, "aal1", "aal2", "verify"],
    [true, "aal2", "aal2", "ready"],
    [true, "aal2", "aal1", "enroll"],
    [true, null, null, "signed-out"],
  ] as const)(
    "session %s %s → %s gives %s",
    (session, current, next, result) => {
      expect(decideAccess(session, current, next)).toBe(result);
    },
  );
});
describe("guards do not mount private queries", () => {
  it.each([
    [{ session: null, access: "signed-out" }, "Login"],
    [{ access: "enroll" }, "Enroll"],
    [{ access: "verify" }, "Verify"],
    [{ access: "ready" }, "Private dashboard"],
    [{ access: "ready", recovery: true }, "Reset"],
  ] satisfies [Partial<AuthState>, string][])(
    "routes state %j to %s",
    (override, expected) => {
      render(
        <AuthContext.Provider value={context(override)}>
          <MemoryRouter>
            <Routes>
              <Route element={<AuthGuard />}>
                <Route element={<MfaGuard />}>
                  <Route path="/" element={<p>Private dashboard</p>} />
                </Route>
              </Route>
              <Route path="/login" element={<p>Login</p>} />
              <Route path="/mfa/enroll" element={<p>Enroll</p>} />
              <Route path="/mfa/verify" element={<p>Verify</p>} />
              <Route path="/reset-password" element={<p>Reset</p>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      if (expected !== "Private dashboard")
        expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
    },
  );
  it("loading and errors fail closed", () => {
    render(
      <AuthContext.Provider value={context({ loading: true })}>
        <MemoryRouter>
          <Routes>
            <Route element={<AuthGuard />}>
              <Route path="/" element={<p>Private dashboard</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
describe("TOTP UI", () => {
  it("invalid OTP never invokes success", async () => {
    fake.verify.mockResolvedValue({ error: new Error("internal message") });
    const onVerified = vi.fn();
    render(<VerifyTotp factorId="factor" onVerified={onVerified} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mã xác thực"), "123456");
    await user.click(screen.getByRole("button", { name: "Xác minh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mã không hợp lệ",
    );
    expect(onVerified).not.toHaveBeenCalled();
    expect(screen.queryByText("internal message")).not.toBeInTheDocument();
  });
  it("successful verification triggers assurance refresh and clears code", async () => {
    const onVerified = vi.fn();
    render(<VerifyTotp factorId="factor" onVerified={onVerified} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mã xác thực"), "123456");
    await user.click(screen.getByRole("button", { name: "Xác minh" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledOnce());
    expect(fake.verify).toHaveBeenCalledWith({
      factorId: "factor",
      code: "123456",
    });
    expect(screen.getByLabelText("Mã xác thực")).toHaveValue("");
  });
  it("enrollment requires an explicit click and leaves verified factors intact", async () => {
    fake.list.mockResolvedValue({
      data: {
        all: [
          { id: "old-unverified", factor_type: "totp", status: "unverified" },
          { id: "working", factor_type: "totp", status: "verified" },
        ],
      },
      error: null,
    });
    render(
      <AuthContext.Provider value={context()}>
        <EnrollTotp />
      </AuthContext.Provider>,
    );
    expect(fake.enroll).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Tạo mã QR bảo mật" }),
    );
    expect(
      await screen.findByRole("img", { name: "Mã QR thiết lập TOTP" }),
    ).toBeInTheDocument();
    expect(fake.unenroll).toHaveBeenCalledWith({ factorId: "old-unverified" });
    expect(fake.unenroll).not.toHaveBeenCalledWith({ factorId: "working" });
  });
});
