import { categories, type SavedPlace } from "../../domain/place";
export function PlaceCard({
  place,
  onSelect,
}: {
  place: SavedPlace;
  onSelect: () => void;
}) {
  return (
    <button className="place-card place-card-button" onClick={onSelect}>
      <span className="category-icon" aria-hidden="true">
        {place.subCategory === "photobooth"
          ? "📸"
          : categories[place.category].icon}
      </span>
      <span>
        <strong>{place.name}</strong>
        <span className="muted">
          {place.address || categories[place.category].label}
        </span>
        <span className="muted">
          {place.isPrivate ? "Riêng tư" : "Địa điểm công khai"}
          {place.needsLocation ? " · Cần bổ sung vị trí" : ""}
        </span>
      </span>
    </button>
  );
}
