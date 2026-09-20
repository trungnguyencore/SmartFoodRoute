import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlaceSearch } from "./PlaceSearch";
import { Attributions } from "./Attributions";
import { PlaceDetailsSheet } from "./PlaceDetailsSheet";
import type { SavedPlace } from "../../domain/place";
const mock = vi.hoisted(() => ({
  autocomplete: vi.fn(),
  searchPlaces: vi.fn(),
  placeDetails: vi.fn(),
}));
vi.mock("../../services/geoProvider", () => ({ geoProvider: mock }));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ access: "ready", session: { user: { id: "owner" } } }),
}));
const place = {
  provider: "geoapify",
  providerPlaceId: "p",
  name: "Cà phê",
  address: "Sài Gòn",
  lat: 10,
  lng: 106,
  categories: [],
  rawCategory: null,
  phone: null,
  website: null,
  openingHoursText: null,
  sourceAttribution: ["Geoapify", "© OpenStreetMap contributors"],
};
function wrap(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.clearAllMocks();
  mock.autocomplete.mockResolvedValue([place, place]);
  mock.searchPlaces.mockResolvedValue([place]);
  mock.placeDetails.mockResolvedValue(place);
});
describe("Geoapify search UI — provider doubles", () => {
  it("requires 3 chars, debounces, deduplicates, supports keyboard selection and clear", async () => {
    const select = vi.fn();
    wrap(<PlaceSearch onSelect={select} />);
    const input = screen.getByRole("combobox", {
      name: "Tìm địa điểm / địa chỉ",
    });
    fireEvent.change(input, { target: { value: "cà" } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(mock.autocomplete).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "cà ph" } });
    fireEvent.change(input, { target: { value: "cà phê" } });
    expect(mock.autocomplete).not.toHaveBeenCalled();
    expect(
      await screen.findAllByRole("option", { name: /Cà phê Sài Gòn/ }),
    ).toHaveLength(1);
    expect(mock.autocomplete).toHaveBeenCalledOnce();
    expect(mock.autocomplete).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "cà phê",
        language: "vi",
        bias: { lat: 10.7769, lng: 106.7009 },
      }),
      expect.any(AbortSignal),
    );
    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveBeenCalledWith(place);
    await userEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm" }));
    expect(input).toHaveValue("");
  });
  it("cancels/ignores stale search results", async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    mock.autocomplete
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce([{ ...place, name: "Mới" }]);
    wrap(<PlaceSearch onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", {
      name: "Tìm địa điểm / địa chỉ",
    });
    fireEvent.change(input, { target: { value: "cũ cũ" } });
    await waitFor(() => expect(mock.autocomplete).toHaveBeenCalledOnce());
    fireEvent.change(input, { target: { value: "mới mới" } });
    expect(await screen.findByRole("option", { name: /Mới/ })).toBeVisible();
    resolveOld?.([{ ...place, name: "Cũ" }]);
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /Cũ/ })).toBeNull(),
    );
    expect((mock.autocomplete.mock.calls[0]?.[1] as AbortSignal).aborted).toBe(
      true,
    );
  });
  it("handles empty, failure and category browse", async () => {
    mock.autocomplete.mockResolvedValueOnce([]);
    wrap(<PlaceSearch onSelect={vi.fn()} />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Tìm địa điểm / địa chỉ" }),
      { target: { value: "không có" } },
    );
    expect(await screen.findByText(/Không tìm thấy địa điểm/)).toBeVisible();
    mock.searchPlaces.mockRejectedValueOnce(new Error("Đã đạt hạn mức"));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Khám phá trong 3 km" }),
      "cafe",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("hạn mức");
    expect(mock.searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["catering.cafe"],
        radiusMeters: 3000,
      }),
      expect.any(AbortSignal),
    );
  });
  it("displays Geoapify/OSM source attribution", () => {
    wrap(<Attributions />);
    expect(screen.getByRole("link", { name: "Geoapify" })).toHaveAttribute(
      "href",
      "https://www.geoapify.com/",
    );
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  });
  it("does not render private external shortcuts and keeps missing hours unknown", async () => {
    const saved: SavedPlace = {
      id: "p",
      userId: "owner",
      source: "geoapify",
      providerPlaceId: "p",
      name: "Riêng",
      address: "Private",
      lat: 10,
      lng: 106,
      category: "food",
      subCategory: null,
      notes: null,
      tags: [],
      isPrivate: true,
      isFavorite: false,
      estimatedCostPerPerson: null,
      averageTimeSpentMinutes: 60,
      googleMapsUrl: "https://maps.app.goo.gl/test",
      sourceName: "Geoapify",
      needsLocation: false,
    };
    wrap(<PlaceDetailsSheet place={saved} onClose={vi.fn()} />);
    expect(await screen.findByText(/Chưa có dữ liệu giờ mở cửa/)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Google Maps Reviews/ }),
    ).toBeNull();
  });
});
