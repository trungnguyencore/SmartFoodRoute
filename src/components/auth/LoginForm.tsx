import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import {
  beginTotpAuth,
  finishTotpAuth,
  TotpAuthError,
} from "../../services/totpAuth";
import {
  exchangeGuestCode,
  formatGuestCodeInput,
  normalizeGuestCodeInput,
} from "../../services/guestAccess";

const emailSchema = z.email("Email không hợp lệ");
type Stage =
  | { kind: "email" }
  | { kind: "verify"; email: string }
  | {
      kind: "enroll";
      email: string;
      factorId: string;
      uri: string;
      secret: string;
    };

export function LoginForm() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [alternate, setAlternate] = useState(false);
  const [guestCode, setGuestCode] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "email" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStage({ kind: "email" });
    setCode("");
    setMessage("");
  };

  const start = async () => {
    const parsed = emailSchema.safeParse(email.trim().toLowerCase());
    if (!parsed.success) {
      setMessage("Email không hợp lệ.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await beginTotpAuth(parsed.data);
      if (result.mode === "verify") {
        setStage({ kind: "verify", email: parsed.data });
      } else {
        setStage({
          kind: "enroll",
          email: parsed.data,
          factorId: result.factorId,
          uri: result.uri,
          secret: result.secret,
        });
      }
    } catch {
      setMessage("Chưa thể bắt đầu đăng nhập. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const enterGuest = async () => {
    const normalized = normalizeGuestCodeInput(guestCode);
    if (normalized.length < 4 || normalized.length > 16) {
      setMessage("Mã phải có 4–16 ký tự A–Z hoặc 0–9.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await exchangeGuestCode(normalized);
      navigate("/guest", { replace: true });
    } catch {
      setMessage("Mã không đúng hoặc đã hết hiệu lực.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (stage.kind === "email") return;
    if (!/^\d{6}$/.test(code)) {
      setMessage("Nhập mã gồm 6 chữ số.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const session = await finishTotpAuth({
        email: stage.email,
        code,
        factorId: stage.kind === "enroll" ? stage.factorId : undefined,
      });
      const restored = await getSupabase().auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (restored.error) throw restored.error;
      setCode("");
      await auth.refresh();
    } catch (error) {
      if (
        error instanceof TotpAuthError &&
        error.code === "AUTH_FLOW_RESTART_REQUIRED"
      ) {
        reset();
        setMessage("Phiên đăng nhập đã đổi. Hãy nhập lại email.");
      } else {
        setMessage("Mã không hợp lệ hoặc đã hết hạn. Hãy thử mã mới.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (stage.kind === "email") {
    if (alternate) {
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void enterGuest();
          }}
        >
          <label>
            Access code
            <input
              aria-label="Access code"
              autoComplete="off"
              inputMode="text"
              value={guestCode}
              onChange={(event) =>
                setGuestCode(formatGuestCodeInput(event.target.value))
              }
              placeholder="A1B2-C3D4"
              minLength={4}
              maxLength={19}
              required
            />
          </label>
          <p className="muted">
            Nhập code được cấp để tiếp tục ở chế độ xem và gửi gợi ý.
          </p>
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Đang kiểm tra…" : "Tiếp tục"}
          </button>
          <button
            className="text-button login-alternate"
            type="button"
            onClick={() => {
              setAlternate(false);
              setGuestCode("");
              setMessage("");
            }}
          >
            Use email instead
          </button>
        </form>
      );
    }
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Đang kiểm tra…" : "Tiếp tục"}
        </button>
        <button
          className="text-button login-alternate"
          type="button"
          onClick={() => {
            setAlternate(true);
            setMessage("");
          }}
        >
          Try another way
        </button>
      </form>
    );
  }

  return (
    <div className="stack">
      <p className="muted">{stage.email}</p>
      {stage.kind === "enroll" ? (
        <>
          <p>
            Email này chưa có Authenticator. Quét QR để đăng ký thiết bị, rồi
            nhập mã 6 số đang hiển thị.
          </p>
          <div role="img" aria-label="Mã QR thiết lập Authenticator">
            <QRCodeSVG value={stage.uri} size={220} />
          </div>
          <details>
            <summary>Không quét được mã QR?</summary>
            <code className="secret">{stage.secret}</code>
          </details>
        </>
      ) : (
        <p>Nhập mã 6 số đang hiển thị trong ứng dụng Authenticator.</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void finish();
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
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <button disabled={busy}>
          {busy
            ? "Đang xác minh…"
            : stage.kind === "enroll"
              ? "Hoàn tất đăng ký"
              : "Đăng nhập"}
        </button>
      </form>
      <button className="secondary" type="button" onClick={reset}>
        Dùng email khác
      </button>
    </div>
  );
}
