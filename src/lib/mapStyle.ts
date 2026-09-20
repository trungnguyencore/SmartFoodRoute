export function mapTilerStyleUrl(key: string | undefined): string {
  if (!key?.trim())
    throw new Error(
      "Thiếu VITE_MAPTILER_API_KEY. Danh sách và địa điểm riêng vẫn dùng được.",
    );
  const url = new URL("https://api.maptiler.com/maps/streets-v4/style.json");
  url.searchParams.set("key", key.trim());
  return url.href;
}
