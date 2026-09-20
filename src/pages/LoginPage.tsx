import { Navigate } from "react-router-dom";
import { LoginForm } from "../components/auth/LoginForm";
import { useAuth } from "../hooks/useAuth";
export function LoginPage({ signup = false }: { signup?: boolean }) {
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
      <h1>{signup ? "Bắt đầu buổi hẹn mới." : "Những điểm hẹn của bạn."}</h1>
      <p className="muted">
        Lưu quán yêu thích và những địa điểm riêng tư. Xác thực hai bước bảo vệ
        dữ liệu của bạn.
      </p>
      {auth.error && (
        <p role="alert" className="error">
          {auth.error}
        </p>
      )}
      <LoginForm signup={signup} />
    </main>
  );
}
