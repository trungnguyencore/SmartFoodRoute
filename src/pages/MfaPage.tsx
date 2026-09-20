import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getSupabase } from "../lib/supabase";
import { EnrollTotp } from "../components/auth/EnrollTotp";
import { VerifyTotp } from "../components/auth/VerifyTotp";
export function MfaPage() {
  const auth = useAuth();
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (auth.access === "verify")
      void getSupabase()
        .auth.mfa.listFactors()
        .then(({ data, error }) => {
          if (!active) return;
          if (error || !data.totp.length) {
            setError("Không tải được thiết bị xác thực.");
            return;
          }
          setFactors(data.totp);
          setSelected(data.totp[0]?.id ?? "");
          setError("");
        })
        .catch(() => {
          if (active) setError("Không kết nối được.");
        });
    return () => {
      active = false;
    };
  }, [auth.access, attempt]);
  if (auth.access === "ready")
    return <Navigate to={auth.recovery ? "/reset-password" : "/"} replace />;
  return (
    <main className="auth-card card">
      <p className="eyebrow">Bảo vệ tài khoản</p>
      <h1>Xác thực hai bước</h1>
      {auth.access === "enroll" ? (
        <EnrollTotp />
      ) : (
        <>
          {factors.length > 1 && (
            <label>
              Thiết bị
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {factors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.friendly_name || "Authenticator"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error ? (
            <p role="alert" className="error">
              {error}{" "}
              <button onClick={() => setAttempt((x) => x + 1)}>Thử lại</button>
            </p>
          ) : selected ? (
            <VerifyTotp factorId={selected} onVerified={auth.refresh} />
          ) : (
            <p role="status">Đang tải thiết bị…</p>
          )}
        </>
      )}
      <p className="muted">
        Nếu mất thiết bị xác thực, cần khôi phục qua quản trị tài khoản sau khi
        xác minh danh tính.
      </p>
      <button className="secondary" onClick={() => void auth.logout()}>
        Đăng xuất
      </button>
    </main>
  );
}
