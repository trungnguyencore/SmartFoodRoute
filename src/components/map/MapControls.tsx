import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useMapStore } from "../../stores/mapStore";
export function MapControls() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <div className="map-controls">
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (!navigator.geolocation) {
            setMessage(
              "Trình duyệt không hỗ trợ định vị. Bản đồ vẫn dùng khu vực hiện tại.",
            );
            return;
          }
          setBusy(true);
          setMessage("");
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (!mounted.current) return;
              useMapStore.getState().setView(
                {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                },
                15,
              );
              setBusy(false);
              setMessage("Đã chuyển đến vị trí của bạn.");
            },
            (error) => {
              if (!mounted.current) return;
              setBusy(false);
              setMessage(
                error.code === 1
                  ? "Bạn chưa cho phép định vị. Bản đồ vẫn dùng khu vực hiện tại."
                  : error.code === 3
                    ? "Định vị quá thời gian chờ. Hãy thử lại."
                    : "Vị trí hiện không khả dụng. Bản đồ vẫn dùng khu vực hiện tại.",
              );
            },
            { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
          );
        }}
      >
        <LocateFixed size={18} aria-hidden="true" />
        {busy ? "Đang định vị…" : "Vị trí của tôi"}
      </button>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
