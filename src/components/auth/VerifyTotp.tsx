import { useState } from "react";
import { getSupabase } from "../../lib/supabase";
export function VerifyTotp({
  factorId,
  onVerified,
}: {
  factorId: string;
  onVerified: () => Promise<void> | void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!/^\d{6}$/.test(code)) {
          setError("Nhập mã gồm 6 chữ số.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const result = await getSupabase().auth.mfa.challengeAndVerify({
            factorId,
            code,
          });
          setCode("");
          if (result.error) {
            setError("Mã không hợp lệ hoặc đã hết hạn. Hãy thử mã mới.");
            return;
          }
          await onVerified();
        } catch {
          setError("Không thể xác minh lúc này. Vui lòng thử lại.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Mã xác thực
        <input
          aria-label="Mã xác thực"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy}>{busy ? "Đang xác minh…" : "Xác minh"}</button>
    </form>
  );
}
