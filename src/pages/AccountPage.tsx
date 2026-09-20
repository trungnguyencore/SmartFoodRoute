import { useState } from "react";
import { Link } from "react-router-dom";
import { MfaStatus } from "../components/auth/MfaStatus";
import { useAuth } from "../hooks/useAuth";
import { getSupabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
export function AccountPage() {
  const auth = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-card card stack">
      <Link to="/">← Về địa điểm</Link>
      <h1>Tài khoản</h1>
      <MfaStatus />
      <p className="muted">
        Tài khoản dùng email + mã 6 số từ Authenticator; không có mật khẩu.
      </p>
      <section className="stack">
        <h2>Xóa dữ liệu ứng dụng</h2>
        <p>
          Xóa mọi địa điểm, tour và thông tin hồ sơ của bạn. Tài khoản đăng nhập
          được giữ lại. Thao tác không thể hoàn tác.
        </p>
        <label>
          Nhập XÓA để xác nhận
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
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
        {message && <p role="status">{message}</p>}
      </section>
      <button className="secondary" onClick={() => void auth.logout()}>
        Đăng xuất
      </button>
    </main>
  );
}
