import { Marker, type Map } from "maplibre-gl";
import { categories, type MapPlace } from "../../domain/place";
export function createPlaceMarker(
  map: Map,
  place: MapPlace,
  selected: boolean,
  onSelect: () => void,
) {
  const visual = categories[place.category];
  const content = document.createElement("button");
  content.type = "button";
  content.className = "place-pin" + (selected ? " selected" : "");
  content.style.backgroundColor = visual.color;
  content.style.width = "44px";
  content.style.height = "44px";
  content.style.padding = "0";
  content.style.zIndex = selected ? "100" : "1";
  content.textContent = place.subCategory === "photobooth" ? "📸" : visual.icon;
  content.setAttribute("aria-label", visual.label + ": " + place.title);
  content.setAttribute("aria-pressed", String(selected));
  content.title = visual.label + ": " + place.title;
  content.addEventListener("click", onSelect);
  const marker = new Marker({ element: content })
    .setLngLat([place.location.lng, place.location.lat])
    .addTo(map);
  return {
    marker,
    dispose: () => {
      content.removeEventListener("click", onSelect);
      marker.remove();
    },
  };
}
