import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getSupabase } from "../lib/supabase";
import { appUrl } from "../lib/env";
export function PasswordPage({ reset = false }: { reset?: boolean }) {
  const auth = useAuth();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (reset && auth.session && auth.access === "verify")
    return <Navigate to="/mfa/verify" replace />;
  return (
    <main className="auth-card card">
      <h1>{reset ? "Đặt mật khẩu mới" : "Khôi phục mật khẩu"}</h1>
      {reset && !auth.session ? (
        <p>Hãy mở liên kết khôi phục trong email hoặc đăng nhập lại.</p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const result = reset
                ? await getSupabase().auth.updateUser({ password: value })
                : await getSupabase().auth.resetPasswordForEmail(value, {
                    redirectTo: appUrl("/reset-password"),
                  });
              if (result.error) throw result.error;
              setValue("");
              if (reset) {
                auth.finishRecovery();
                await auth.logout();
                setMessage("Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.");
              } else
                setMessage(
                  "Nếu email hợp lệ, bạn sẽ nhận được liên kết khôi phục.",
                );
            } catch {
              setMessage("Không thực hiện được lúc này. Hãy thử lại.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {reset ? "Mật khẩu mới" : "Email"}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={reset ? "password" : "email"}
              minLength={reset ? 8 : undefined}
              autoComplete={reset ? "new-password" : "email"}
              required
            />
          </label>
          <button disabled={busy}>
            {reset ? "Đổi mật khẩu" : "Gửi liên kết"}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <Link to="/login">Về đăng nhập</Link>
    </main>
  );
}
