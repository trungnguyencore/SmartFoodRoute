import { Navigate } from "react-router-dom";
import { LoginForm } from "../components/auth/LoginForm";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <p role="status" className="card">
        Đang kiểm tra phiên…
      </p>
    );
  if (auth.session && !auth.error && auth.access !== "signed-out")
    return <Navigate to="/" replace />;
  return (
    <main className="auth-card card">
      <p className="eyebrow">SmartFoodRoute</p>
      <h1>Những điểm hẹn của bạn.</h1>
      <p className="muted">
        Không cần mật khẩu. Nhập email rồi dùng mã 6 số từ Authenticator để
        đăng nhập; email mới sẽ được hướng dẫn quét QR một lần.
      </p>
      {auth.error && (
        <p role="alert" className="error">
          {auth.error}
        </p>
      )}
      <LoginForm />
    </main>
  );
}
