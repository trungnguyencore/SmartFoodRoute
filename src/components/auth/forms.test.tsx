import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LoginForm } from "./LoginForm";
import { AuthContext } from "../../features/auth/context";

const sdk = vi.hoisted(() => ({
  begin: vi.fn(),
  finish: vi.fn(),
  setSession: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../services/totpAuth", () => {
  class TotpAuthError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(code);
    }
  }
  return {
    beginTotpAuth: sdk.begin,
    finishTotpAuth: sdk.finish,
    TotpAuthError,
  };
});

vi.mock("../../lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      setSession: sdk.setSession,
    },
  }),
}));

function renderForm() {
  return render(
    <AuthContext.Provider
      value={{
        session: null,
        access: "signed-out",
        loading: false,
        error: null,
        recovery: false,
        refresh: sdk.refresh,
        logout: vi.fn(),
        finishRecovery: vi.fn(),
      }}
    >
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  sdk.begin.mockReset();
  sdk.finish.mockReset();
  sdk.setSession.mockReset();
  sdk.refresh.mockReset();
  sdk.setSession.mockResolvedValue({ data: {}, error: null });
  sdk.refresh.mockResolvedValue(undefined);
});

it("existing account uses email then Authenticator code with no password", async () => {
  sdk.begin.mockResolvedValue({ mode: "verify" });
  sdk.finish.mockResolvedValue({
    access_token: "aal2-access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
  });
  renderForm();
  const user = userEvent.setup();

  expect(screen.queryByLabelText("Mật khẩu")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), "User@Example.com");
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }));

  await waitFor(() =>
    expect(sdk.begin).toHaveBeenCalledWith("user@example.com"),
  );
  expect(
    screen.getByText(/mã 6 số đang hiển thị trong ứng dụng Authenticator/i),
  ).toBeInTheDocument();

  await user.type(screen.getByLabelText("Mã xác thực"), "123456");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await waitFor(() =>
    expect(sdk.finish).toHaveBeenCalledWith({
      email: "user@example.com",
      code: "123456",
      factorId: undefined,
    }),
  );
  expect(sdk.setSession).toHaveBeenCalledWith({
    access_token: "aal2-access",
    refresh_token: "refresh",
  });
  expect(sdk.refresh).toHaveBeenCalled();
});

it("new account shows QR and binds verification to the enrollment factor", async () => {
  sdk.begin.mockResolvedValue({
    mode: "enroll",
    factorId: "30000000-0000-4000-8000-000000000003",
    uri: "otpauth://totp/SmartFoodRoute?secret=TESTONLY",
    secret: "TESTONLY",
  });
  sdk.finish.mockResolvedValue({
    access_token: "aal2-access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
  });
  renderForm();
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
  expect(
    await screen.findByRole("img", { name: "Mã QR thiết lập Authenticator" }),
  ).toBeInTheDocument();
  expect(screen.getByText("TESTONLY")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Mã xác thực"), "123456");
  await user.click(screen.getByRole("button", { name: "Hoàn tất đăng ký" }));
  await waitFor(() =>
    expect(sdk.finish).toHaveBeenCalledWith({
      email: "new@example.com",
      code: "123456",
      factorId: "30000000-0000-4000-8000-000000000003",
    }),
  );
});

it("invalid code stays generic and never exposes provider internals", async () => {
  sdk.begin.mockResolvedValue({ mode: "verify" });
  sdk.finish.mockRejectedValue(new Error("sensitive provider message"));
  renderForm();
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
  await user.type(screen.getByLabelText("Mã xác thực"), "000000");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByRole("status")).toHaveTextContent(
    "Mã không hợp lệ",
  );
  expect(
    screen.queryByText("sensitive provider message"),
  ).not.toBeInTheDocument();
  expect(sdk.setSession).not.toHaveBeenCalled();
});
