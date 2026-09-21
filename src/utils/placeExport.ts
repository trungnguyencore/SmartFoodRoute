import type { SavedPlace } from "../domain/place";
import { safeGoogleMapsUrl } from "./externalUrls";

function exportGoogleMapsUrl(place: SavedPlace): string {
  const saved = safeGoogleMapsUrl(place.googleMapsUrl);
  if (saved) return saved;

  const query =
    place.lat !== null && place.lng !== null
      ? `${place.lat},${place.lng}`
      : [place.name, place.address].filter(Boolean).join(", ");
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query || place.name);
  return url.href;
}

export function buildPlacesTxt(places: SavedPlace[]): string {
  let startIndex = 0;
  let destinationIndex = 1;
  return places
    .map((place) => {
      const prefix =
        place.category === "start_point"
          ? `H${startIndex++}`
          : `D${destinationIndex++}`;
      return `${prefix} - ${place.name}\nGoogle Maps: ${exportGoogleMapsUrl(place)}`;
    })
    .join("\n\n");
}

export function downloadPlacesTxt(
  places: SavedPlace[],
  filename = "smartfoodroute-dia-diem.txt",
) {
  const text = buildPlacesTxt(places);
  const blob = new Blob(["\uFEFF", text, "\n"], {
    type: "text/plain;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
