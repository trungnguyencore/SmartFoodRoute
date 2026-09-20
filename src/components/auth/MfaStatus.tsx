import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { EnrollTotp } from "./EnrollTotp";
export function MfaStatus() {
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string }[]
  >([]);
  const [replace, setReplace] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getSupabase()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError("Chưa tải được thiết bị xác thực.");
        else setFactors(data.totp);
      })
      .catch(() => {
        if (active) setError("Không kết nối được.");
      });
    return () => {
      active = false;
    };
  }, []);
  if (replace) return <EnrollTotp replacing={replace} />;
  return (
    <section>
      <h2>Thiết bị xác thực</h2>
      {error && <p role="alert">{error}</p>}
      {factors.map((f) => (
        <div className="row" key={f.id}>
          <span>{f.friendly_name || "Authenticator"}</span>
          <button className="secondary" onClick={() => setReplace(f.id)}>
            Thay thiết bị
          </button>
        </div>
      ))}
    </section>
  );
}
