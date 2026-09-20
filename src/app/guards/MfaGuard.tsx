import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
export function MfaGuard() {
  const auth = useAuth();
  if (auth.loading) return <p role="status">Đang kiểm tra bảo mật…</p>;
  if (auth.recovery) return <Navigate to="/reset-password" replace />;
  if (auth.access !== "ready")
    return (
      <Navigate
        to={auth.access === "verify" ? "/mfa/verify" : "/mfa/enroll"}
        replace
      />
    );
  return <Outlet />;
}
