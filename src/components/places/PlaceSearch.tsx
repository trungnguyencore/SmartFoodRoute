import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { useMapStore } from "../../stores/mapStore";
import { geoProvider, type GeoPlace } from "../../services/geoProvider";
import { Attributions } from "./Attributions";
const browseCategories = {
  food: ["catering.restaurant", "catering.fast_food", "catering.food_court"],
  drink: ["catering.bar", "catering.pub", "catering.biergarten"],
  cafe: ["catering.cafe"],
  cinema: ["entertainment.cinema"],
  entertainment: ["entertainment", "leisure"],
} as const;
type Browse = keyof typeof browseCategories;
export function PlaceSearch({
  onSelect,
}: {
  onSelect: (place: GeoPlace) => void;
}) {
  const [text, setText] = useState(""),
    [debounced, setDebounced] = useState("");
  const [browse, setBrowse] = useState<Browse | "">("");
  const [active, setActive] = useState(-1),
    [closed, setClosed] = useState(false);
  const center = useMapStore((s) => s.center),
    auth = useAuth(),
    listId = useId();
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(timeout);
  }, [text]);
  const ready =
    auth.access === "ready" &&
    !closed &&
    (!!browse || (debounced.length >= 3 && text.trim() === debounced));
  const query = useQuery({
    queryKey: [
      "geo-search",
      auth.session?.user.id,
      debounced,
      browse,
      center.lat,
      center.lng,
    ],
    queryFn: ({ signal }) =>
      browse
        ? geoProvider.searchPlaces(
            {
              categories: [...browseCategories[browse]],
              center,
              radiusMeters: 3000,
              limit: 10,
              language: "vi",
            },
            signal,
          )
        : geoProvider.autocomplete(
            { text: debounced, bias: center, limit: 5, language: "vi" },
            signal,
          ),
    enabled: ready,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const places = ready
    ? [
        ...new Map(
          (query.data ?? []).map((p) => [p.providerPlaceId, p]),
        ).values(),
      ]
    : [];
  function choose(place: GeoPlace) {
    setClosed(true);
    setActive(-1);
    onSelect(place);
  }
  return (
    <div className="stack">
      <label>
        Tìm địa điểm / địa chỉ
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={ready && places.length > 0}
          aria-activedescendant={
            places[active] ? listId + "-" + active : undefined
          }
          value={text}
          placeholder="Nhập ít nhất 3 ký tự"
          maxLength={200}
          onChange={(e) => {
            setText(e.target.value);
            setBrowse("");
            setActive(-1);
            setClosed(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, places.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && places[active]) {
              e.preventDefault();
              choose(places[active]);
            }
            if (e.key === "Escape") {
              setClosed(true);
              setActive(-1);
            }
          }}
        />
      </label>
      <div className="row">
        <button
          className="secondary"
          onClick={() => {
            setText("");
            setDebounced("");
            setBrowse("");
            setClosed(false);
            setActive(-1);
          }}
        >
          Xóa tìm kiếm
        </button>
        <label>
          Khám phá trong 3 km
          <select
            value={browse}
            onChange={(e) => {
              setBrowse(e.target.value as Browse | "");
              setClosed(false);
              setActive(-1);
            }}
          >
            <option value="">Chọn danh mục</option>
            <option value="food">Ăn</option>
            <option value="drink">Uống</option>
            <option value="cafe">Cà phê</option>
            <option value="cinema">Rạp phim</option>
            <option value="entertainment">Vui chơi</option>
          </select>
        </label>
      </div>
      {!browse && text.trim().length < 3 && (
        <p className="muted">Nhập ít nhất 3 ký tự để tìm kiếm.</p>
      )}
      {ready && query.isFetching && <p role="status">Đang tìm địa điểm…</p>}
      {ready && query.isError && (
        <p role="alert" className="error">
          {query.error.message}
        </p>
      )}
      {ready && query.isSuccess && !query.isFetching && !places.length && (
        <p role="status">
          Không tìm thấy địa điểm. Thử địa chỉ khác hoặc thêm địa điểm riêng.
        </p>
      )}
      <div id={listId} role="listbox" aria-label="Kết quả tìm kiếm">
        {places.map((p, i) => (
          <button
            key={p.providerPlaceId}
            id={listId + "-" + i}
            role="option"
            aria-selected={i === active}
            className="search-result secondary"
            onClick={() => choose(p)}
          >
            <strong>{p.name}</strong> <span>{p.address}</span>
          </button>
        ))}
      </div>
      <Attributions />
    </div>
  );
}
