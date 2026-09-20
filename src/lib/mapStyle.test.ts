import { expect, it } from "vitest";
import { mapTilerStyleUrl } from "./mapStyle";
it("fails clearly without a key", () =>
  expect(() => mapTilerStyleUrl("")).toThrow("VITE_MAPTILER_API_KEY"));
it("uses a fixed HTTPS style and URL-encodes the public browser key", () => {
  const url = new URL(mapTilerStyleUrl("test&only"));
  expect(url.origin).toBe("https://api.maptiler.com");
  expect(url.pathname).toBe("/maps/streets-v4/style.json");
  expect(url.searchParams.get("key")).toBe("test&only");
  expect([...url.searchParams.keys()]).toEqual(["key"]);
});
