import { useState } from "react";
import { Copy, Link2, Save, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useHref } from "react-router-dom";
import type { SaveTourInput } from "../../domain/tour";
import {
  revokeShareToken,
  rotateShareToken,
  saveTourSnapshot,
} from "../../services/tourService";

export function ShareTourPanel({ draft }: { draft: SaveTourInput }) {
  const [title, setTitle] = useState(draft.title);
  const [tourId, setTourId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "share" | "revoke" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const href = useHref("/share/" + (token ?? "pending"));
  const shareUrl = token ? new URL(href, window.location.origin).toString() : "";

  async function save() {
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const id = await saveTourSnapshot({ ...draft, title });
      setTourId(id);
      setMessage("Đã lưu snapshot lịch trình.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được tour.");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!tourId) return;
    setBusy("share");
    setError("");
    setMessage("");
    try {
      const next = await rotateShareToken(tourId);
      setToken(next);
      setMessage(
        token ? "Đã đổi token; link cũ không còn hiệu lực." : "Đã tạo link chia sẻ.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không tạo được link chia sẻ.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!tourId) return;
    setBusy("revoke");
    setError("");
    setMessage("");
    try {
      await revokeShareToken(tourId);
      setToken(null);
      setMessage("Đã thu hồi link chia sẻ.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không thu hồi được link.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Đã sao chép link chia sẻ.");
      setError("");
    } catch {
      setError("Trình duyệt không cho phép sao chép tự động. Hãy copy link thủ công.");
    }
  }

  return (
    <section className="share-panel" aria-label="Lưu và chia sẻ lịch trình">
      <div>
        <p className="eyebrow">Phase 9 Sharing</p>
        <h3>Lưu và chia sẻ lịch trình này</h3>
        <p className="muted">
          Điểm bắt đầu và địa điểm riêng tư được che ở server trước khi public.
        </p>
      </div>
      <label>
        Tên tour
        <input
          value={title}
          maxLength={120}
          disabled={!!tourId}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="row">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!!tourId || busy !== null || !title.trim()}
        >
          <Save size={17} aria-hidden="true" />
          {busy === "save" ? "Đang lưu…" : tourId ? "Đã lưu tour" : "Lưu tour"}
        </button>
        {tourId && (
          <button
            type="button"
            className="secondary"
            onClick={() => void share()}
            disabled={busy !== null}
          >
            <Link2 size={17} aria-hidden="true" />
            {busy === "share"
              ? "Đang tạo link…"
              : token
                ? "Đổi token chia sẻ"
                : "Tạo link chia sẻ"}
          </button>
        )}

        {tourId && token && (
          <button
            type="button"
            className="danger"
            onClick={() => void revoke()}
            disabled={busy !== null}
          >
            <ShieldOff size={17} aria-hidden="true" />
            {busy === "revoke" ? "Đang thu hồi…" : "Thu hồi link"}
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {shareUrl && (
        <div className="share-output">
          <div className="share-qr" aria-label="QR link chia sẻ">
            <QRCodeSVG value={shareUrl} size={176} marginSize={2} />
          </div>
          <div className="stack">
            <p className="muted">
              Token hiện tại tự hết hạn sau 7 ngày và có thể thu hồi bất kỳ lúc nào.
            </p>
            <label>
              Link public
              <input value={shareUrl} readOnly />
            </label>
            <button type="button" className="secondary" onClick={() => void copy()}>
              <Copy size={17} aria-hidden="true" />
              Sao chép link
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
