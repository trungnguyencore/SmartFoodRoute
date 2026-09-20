import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getSupabase } from "../../lib/supabase";
import { VerifyTotp } from "./VerifyTotp";
import { useAuth } from "../../hooks/useAuth";
type Enrollment = { id: string; secret: string; uri: string };
export function EnrollTotp({ replacing }: { replacing?: string }) {
  const { refresh } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  if (replacing && !reauthenticated)
    return (
      <>
        <p>Xác minh mã từ ứng dụng hiện tại trước khi thay thiết bị.</p>
        <VerifyTotp
          factorId={replacing}
          onVerified={() => setReauthenticated(true)}
        />
      </>
    );
  return (
    <div className="stack">
      <p>
        Thêm SmartFoodRoute vào Google Authenticator hoặc ứng dụng TOTP tương
        thích.
      </p>
      {!enrollment ? (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const auth = getSupabase().auth;
              const listed = await auth.mfa.listFactors();
              if (listed.error) throw listed.error;
              // Remove only abandoned, unverified enrollments; never remove a working factor.
              for (const factor of listed.data.all.filter(
                (f) => f.factor_type === "totp" && f.status === "unverified",
              )) {
                const removed = await auth.mfa.unenroll({
                  factorId: factor.id,
                });
                if (removed.error) throw removed.error;
              }
              const { data, error } = await auth.mfa.enroll({
                factorType: "totp",
                friendlyName: "SmartFoodRoute " + new Date().toISOString(),
                issuer: "SmartFoodRoute",
              });
              if (error) throw error;
              setEnrollment({
                id: data.id,
                secret: data.totp.secret,
                uri: data.totp.uri,
              });
            } catch {
              setMessage("Chưa tạo được mã QR. Hãy thử lại.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Tạo mã QR bảo mật
        </button>
      ) : (
        <>
          <div role="img" aria-label="Mã QR thiết lập TOTP">
            <QRCodeSVG value={enrollment.uri} size={220} />
          </div>
          <details>
            <summary>Không quét được mã QR?</summary>
            <code className="secret">{enrollment.secret}</code>
            <button
              className="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(enrollment.secret)
                  .then(() => setMessage("Đã sao chép khóa."))
                  .catch(() =>
                    setMessage(
                      "Không sao chép được; bạn có thể nhập khóa thủ công.",
                    ),
                  )
              }
            >
              Sao chép khóa
            </button>
          </details>
          <VerifyTotp
            factorId={enrollment.id}
            onVerified={async () => {
              if (replacing) {
                const { error } = await getSupabase().auth.mfa.unenroll({
                  factorId: replacing,
                });
                if (error) {
                  setMessage(
                    "Thiết bị mới đã xác minh; chưa gỡ được thiết bị cũ. Hãy kiểm tra lại trong tài khoản.",
                  );
                  return;
                }
              }
              setEnrollment(null);
              await refresh();
            }}
          />
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
