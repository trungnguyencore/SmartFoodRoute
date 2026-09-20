import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LoginForm } from "./LoginForm";
import { PasswordPage } from "../../pages/PasswordPage";
import { AuthContext } from "../../features/auth/context";
const sdk = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: sdk.signIn,
      signUp: sdk.signUp,
      resetPasswordForEmail: sdk.reset,
    },
  }),
}));
vi.mock("../../lib/env", () => ({
  appUrl: (path: string) => "https://test.example" + path,
}));
beforeEach(() => {
  sdk.signIn.mockResolvedValue({ data: {}, error: null });
  sdk.signUp.mockResolvedValue({ data: { session: null }, error: null });
  sdk.reset.mockResolvedValue({ error: null });
});
it("submits email/password as first factor", async () => {
  render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Mật khẩu"), "test-password");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
  expect(sdk.signIn).toHaveBeenCalledWith({
    email: "test@example.com",
    password: "test-password",
  });
});
it("signup with email confirmation explains the next step", async () => {
  render(
    <MemoryRouter>
      <LoginForm signup />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Mật khẩu"), "test-password");
  await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
  expect(await screen.findByRole("status")).toHaveTextContent("kiểm tra email");
  expect(sdk.signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: { emailRedirectTo: "https://test.example/auth/callback" },
    }),
  );
});
it("login errors do not expose SDK internals", async () => {
  sdk.signIn.mockResolvedValue({
    error: new Error("sensitive internal error"),
  });
  render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Mật khẩu"), "test-password");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Đăng nhập thất bại",
  );
  expect(
    screen.queryByText("sensitive internal error"),
  ).not.toBeInTheDocument();
});
it("password recovery uses the configured callback and a generic confirmation", async () => {
  render(
    <AuthContext.Provider
      value={{
        session: null,
        access: "signed-out",
        loading: false,
        error: null,
        recovery: false,
        refresh: vi.fn(),
        logout: vi.fn(),
        finishRecovery: vi.fn(),
      }}
    >
      <MemoryRouter>
        <PasswordPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.click(screen.getByRole("button", { name: "Gửi liên kết" }));
  await waitFor(() =>
    expect(sdk.reset).toHaveBeenCalledWith("test@example.com", {
      redirectTo: "https://test.example/reset-password",
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Nếu email hợp lệ",
  );
});
