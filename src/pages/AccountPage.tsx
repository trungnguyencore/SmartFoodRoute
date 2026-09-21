import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MfaStatus } from "../components/auth/MfaStatus";
import { useAuth } from "../hooks/useAuth";
import { getSupabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import {
  adminCreateGuestCode,
  adminDeleteGuestCode,
  adminDeleteGuestSuggestion,
  adminListGuestAccess,
  formatGuestCodeInput,
  normalizeGuestCodeInput,
  type GuestCode,
  type GuestSuggestion,
} from "../services/guestAccess";

export function AccountPage() {
  const auth = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminAccess, setAdminAccess] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<GuestCode[]>([]);
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);
  const [newCode, setNewCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const refreshGuestAdmin = async () => {
    const token = auth.session?.access_token;
    if (!token || auth.access !== "ready") return;
    try {
      const data = await adminListGuestAccess(token);
      setAdminAccess(true);
      setCodes(data.codes);
      setSuggestions(data.suggestions);
    } catch {
      setAdminAccess(false);
      setCodes([]);
      setSuggestions([]);
    }
  };

  useEffect(() => {
    void refreshGuestAdmin();
    // Re-evaluate only when the signed-in AAL2 identity/session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session?.user.id, auth.session?.access_token, auth.access]);

  return (
    <main className="account-card card stack">
      <Link to="/">← Về địa điểm</Link>
      <h1>Tài khoản</h1>
      <MfaStatus />
      <p className="muted">
        Tài khoản dùng email + mã 6 số từ Authenticator; không có mật khẩu.
      </p>

      {adminAccess && (
        <section className="stack account-section">
          <div>
            <span className="eyebrow">ADMIN</span>
            <h2>Access codes</h2>
            <p className="muted">
              Code dài 4–16 ký tự A–Z/0–9. Dấu gạch được thêm tự động sau mỗi
              nhóm 4 ký tự. Guest chỉ có quyền xem và gửi gợi ý.
            </p>
          </div>
          <form
            className="account-code-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const normalized = normalizeGuestCodeInput(newCode);
              if (normalized.length < 4 || normalized.length > 16) {
                setMessage("Code phải có 4–16 ký tự A–Z hoặc 0–9.");
                return;
              }
              const token = auth.session?.access_token;
              if (!token) return;
              setBusy(true);
              setMessage("");
              try {
                const created = await adminCreateGuestCode(token, normalized);
                setCreatedCode(created.code);
                setNewCode("");
                await refreshGuestAdmin();
                setMessage("Đã tạo code. Hãy sao chép trước khi rời trang.");
              } catch (error) {
                setMessage(
                  error instanceof Error && error.message === "DUPLICATE_CODE"
                    ? "Code này đã tồn tại."
                    : "Chưa tạo được code.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Code mới
              <input
                aria-label="Code mới"
                value={newCode}
                onChange={(event) =>
                  setNewCode(formatGuestCodeInput(event.target.value))
                }
                placeholder="A1B2-C3D4-E5"
                autoComplete="off"
                maxLength={19}
              />
            </label>
            <button disabled={busy}>Thêm code</button>
          </form>
          {createdCode && (
            <div className="notice stack">
              <strong>Code vừa tạo: {createdCode}</strong>
              <button
                type="button"
                className="secondary"
                onClick={() => void navigator.clipboard.writeText(createdCode)}
              >
                Sao chép code
              </button>
            </div>
          )}
          <div className="admin-code-list">
            {codes.length ? (
              codes.map((code) => (
                <div className="admin-code-row" key={code.id}>
                  <div>
                    <strong>{code.codeHint}</strong>
                    <small>
                      Tạo {new Date(code.createdAt).toLocaleString("vi-VN")}
                    </small>
                  </div>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm("Xóa code này? Guest đang dùng code sẽ mất quyền truy cập."))
                        return;
                      const token = auth.session?.access_token;
                      if (!token) return;
                      setBusy(true);
                      try {
                        await adminDeleteGuestCode(token, code.id);
                        await refreshGuestAdmin();
                        setMessage("Đã xóa code.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Xóa
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">Chưa có code nào.</p>
            )}
          </div>
        </section>
      )}

      {adminAccess && (
        <section className="stack account-section">
          <h2>Gợi ý mới</h2>
          {suggestions.length ? (
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <article className="card stack suggestion-card" key={suggestion.id}>
                  <div>
                    <strong>{suggestion.name}</strong>
                    <small>
                      {new Date(suggestion.createdAt).toLocaleString("vi-VN")}
                      {suggestion.codeHint ? ` · ${suggestion.codeHint}` : ""}
                    </small>
                  </div>
                  {suggestion.address && <p>{suggestion.address}</p>}
                  <div className="suggestion-links">
                    {suggestion.googleMapsUrl && (
                      <a href={suggestion.googleMapsUrl} target="_blank" rel="noreferrer">
                        Google Maps ↗
                      </a>
                    )}
                    {suggestion.tiktokUrl && (
                      <a href={suggestion.tiktokUrl} target="_blank" rel="noreferrer">
                        TikTok ↗
                      </a>
                    )}
                  </div>
                  {suggestion.notes && <p className="muted">{suggestion.notes}</p>}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      const token = auth.session?.access_token;
                      if (!token) return;
                      setBusy(true);
                      try {
                        await adminDeleteGuestSuggestion(token, suggestion.id);
                        await refreshGuestAdmin();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Xóa gợi ý
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Chưa có gợi ý mới.</p>
          )}
        </section>
      )}

      <section className="stack account-section">
        <h2>Xóa dữ liệu ứng dụng</h2>
        <p>
          Xóa mọi địa điểm, tour và thông tin hồ sơ của bạn. Tài khoản đăng nhập
          được giữ lại. Thao tác không thể hoàn tác.
        </p>
        <label>
          Nhập XÓA để xác nhận
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button
          className="danger"
          disabled={confirmation !== "XÓA" || busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const { error } = await getSupabase().rpc("delete_my_app_data");
              if (error) throw error;
              await queryClient.cancelQueries();
              queryClient.clear();
              setConfirmation("");
              setMessage("Đã xóa dữ liệu ứng dụng.");
            } catch {
              setMessage("Chưa xóa được dữ liệu. Vui lòng thử lại.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Xóa toàn bộ dữ liệu của tôi
        </button>
      </section>
      {message && <p role="status" className="notice">{message}</p>}
      <button className="secondary" onClick={() => void auth.logout()}>
        Đăng xuất
      </button>
    </main>
  );
}
