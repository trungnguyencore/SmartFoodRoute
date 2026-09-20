import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
export function AuthGuard() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <p role="status" className="card">
        Đang kiểm tra phiên…
      </p>
    );
  if (auth.error)
    return (
      <main className="auth-card card">
        <p role="alert">{auth.error}</p>
        <div className="row">
          <button onClick={() => void auth.refresh()}>Thử lại</button>
          <button onClick={() => void auth.logout()}>Đăng xuất</button>
        </div>
      </main>
    );
  if (!auth.session || auth.access === "signed-out")
    return <Navigate to="/login" replace />;
  return <Outlet />;
}
