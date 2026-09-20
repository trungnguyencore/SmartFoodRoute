import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "./guards/AuthGuard";
import { MfaGuard } from "./guards/MfaGuard";
import { LoginPage } from "../pages/LoginPage";

const MfaPage = lazy(() =>
  import("../pages/MfaPage").then((m) => ({ default: m.MfaPage })),
);
const AccountPage = lazy(() =>
  import("../pages/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const DashboardPage = lazy(() =>
  import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const SharedTourPage = lazy(() =>
  import("../pages/SharedTourPage").then((m) => ({ default: m.SharedTourPage })),
);

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <p role="status" className="card">
          Đang mở trang…
        </p>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/reset-password" element={<Navigate to="/login" replace />} />
        <Route path="/auth/callback" element={<Navigate to="/login" replace />} />
        <Route path="/share/:token" element={<SharedTourPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/mfa/enroll" element={<MfaPage />} />
          <Route path="/mfa/verify" element={<MfaPage />} />
          <Route element={<MfaGuard />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/account" element={<AccountPage />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <main className="card">
              <h1>Không tìm thấy trang</h1>
              <Link to="/">Về trang chủ</Link>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}
