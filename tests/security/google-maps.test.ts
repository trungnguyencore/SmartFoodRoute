import { describe, expect, it, vi } from "vitest";
import {
  coordinatesFromGoogleMapsUrl,
  isGoogleMapsUrl,
  lookupTextFromGoogleMapsUrl,
  resolveGoogleMapsRedirects,
} from "../../supabase/functions/_shared/googleMaps";

describe("Google Maps link resolver", () => {
  it("accepts supported Google Maps hosts and rejects arbitrary URLs", () => {
    expect(
      isGoogleMapsUrl("https://www.google.com/maps/@10.7769,106.7009,15z"),
    ).toBe(true);
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/testOnly")).toBe(true);
    expect(isGoogleMapsUrl("https://evil.example/maps/@10,106,15z")).toBe(
      false,
    );
    expect(isGoogleMapsUrl("http://www.google.com/maps/@10,106,15z")).toBe(
      false,
    );
  });

  it("extracts coordinates from @, data and query URL forms", () => {
    expect(
      coordinatesFromGoogleMapsUrl(
        "https://www.google.com/maps/@10.7769,106.7009,15z",
      ),
    ).toEqual({ lat: 10.7769, lng: 106.7009 });
    expect(
      coordinatesFromGoogleMapsUrl(
        "https://www.google.com/maps/place/Test/data=!8m2!3d10.772!4d106.698",
      ),
    ).toEqual({ lat: 10.772, lng: 106.698 });
    expect(
      coordinatesFromGoogleMapsUrl(
        "https://www.google.com/maps/search/?api=1&query=10.78%2C106.7",
      ),
    ).toEqual({ lat: 10.78, lng: 106.7 });
  });

  it("extracts lookup text when coordinates are absent", () => {
    expect(
      lookupTextFromGoogleMapsUrl(
        "https://www.google.com/maps/place/Ch%E1%BB%A3+B%E1%BA%BFn+Th%C3%A0nh/",
      ),
    ).toBe("Chợ Bến Thành");
    expect(
      lookupTextFromGoogleMapsUrl(
        "https://www.google.com/maps/search/?api=1&query=Landmark+81",
      ),
    ).toBe("Landmark 81");
  });

  it("follows only allowlisted short-link redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.google.com/maps/place/Test/@10.78,106.7,17z",
        },
      }),
    );
    await expect(
      resolveGoogleMapsRedirects("https://maps.app.goo.gl/testOnly", fetcher),
    ).resolves.toBe(
      "https://www.google.com/maps/place/Test/@10.78,106.7,17z",
    );
    expect(fetcher).toHaveBeenCalledOnce();

    const unsafe = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/steal" },
      }),
    );
    await expect(
      resolveGoogleMapsRedirects("https://maps.app.goo.gl/testOnly", unsafe),
    ).rejects.toThrow("UNSAFE_REDIRECT");
  });

  it("does not fetch long Google Maps links that already contain location data", async () => {
    const fetcher = vi.fn();
    const url = "https://www.google.com/maps/@10.7769,106.7009,15z";
    await expect(resolveGoogleMapsRedirects(url, fetcher)).resolves.toBe(url);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
