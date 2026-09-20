import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Map as LibreMap } from "maplibre-gl";
import { MapControls } from "./MapControls";
import { MapCanvas } from "./MapCanvas";
import { createPlaceMarker } from "./PlaceMarker";
import { useMapStore } from "../../stores/mapStore";
const mocks = vi.hoisted(() => ({
  config: { key: undefined as string | undefined },
  maps: [] as {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    addSource: ReturnType<typeof vi.fn>;
    getSource: ReturnType<typeof vi.fn>;
    handlers: Record<string, () => void>;
  }[],
  markers: [] as { element: HTMLElement; remove: ReturnType<typeof vi.fn> }[],
}));
vi.mock("../../lib/env", () => ({ mapsConfig: mocks.config }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    handlers: Record<string, () => void> = {};
    on = vi.fn((name: string, fn: () => void) => {
      this.handlers[name] = fn;
    });
    off = vi.fn();
    remove = vi.fn();
    addSource = vi.fn();
    getSource = vi.fn(() => ({ setData: vi.fn() }));
    addLayer = vi.fn();
    addControl = vi.fn();
    resize = vi.fn();
    jumpTo = vi.fn();
    getCenter = () => ({ lat: 10.7769, lng: 106.7009 });
    getZoom = () => 13;
    loaded = () => true;
    constructor() {
      mocks.maps.push(this);
    }
  },
  NavigationControl: class {},
  AttributionControl: class {},
  Marker: class {
    element: HTMLElement;
    remove = vi.fn();
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
      mocks.markers.push(this);
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  },
}));
beforeEach(() => {
  useMapStore.getState().reset();
  mocks.config.key = undefined;
  mocks.maps.length = 0;
  mocks.markers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
describe("MapLibre contracts — not live rendering", () => {
  it("shows missing-config fallback without creating map", async () => {
    render(<MapCanvas />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "VITE_MAPTILER_API_KEY",
    );
    expect(mocks.maps).toHaveLength(0);
  });
  it("initializes once, updates markers without duplicates, and removes all resources", async () => {
    mocks.config.key = "test-only";
    const place = {
      id: "p",
      title: "Quán",
      category: "food" as const,
      location: { lat: 10, lng: 106 },
    };
    const view = render(
      <StrictMode>
        <MapCanvas places={[place]} />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.maps).toHaveLength(1));
    await act(async () => mocks.maps[0]?.handlers.load?.());
    await waitFor(() => expect(mocks.markers).toHaveLength(1));
    expect(mocks.maps[0]?.addSource).toHaveBeenCalledWith(
      "route-preview",
      expect.objectContaining({ type: "geojson" }),
    );
    view.rerender(
      <StrictMode>
        <MapCanvas places={[{ ...place, title: "Mới" }]} />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.markers).toHaveLength(2));
    expect(mocks.maps).toHaveLength(1);
    expect(mocks.markers[0]?.remove).toHaveBeenCalledOnce();
    view.unmount();
    expect(mocks.markers[1]?.remove).toHaveBeenCalledOnce();
    expect(mocks.maps[0]?.remove).toHaveBeenCalledOnce();
    expect(mocks.maps[0]?.off).toHaveBeenCalledTimes(3);
  });
  it("normalizes provider map errors without displaying secret-bearing error messages", async () => {
    mocks.config.key = "test-only";
    render(<MapCanvas />);
    await waitFor(() => expect(mocks.maps).toHaveLength(1));
    await act(async () => mocks.maps[0]?.handlers.error?.());
    expect(screen.getByRole("alert")).toHaveTextContent("Allowed HTTP Origins");
    await userEvent.click(screen.getByRole("button", { name: "Thử tải lại" }));
    await waitFor(() => expect(mocks.maps).toHaveLength(2));
    expect(mocks.maps[0]?.remove).toHaveBeenCalledOnce();
  });
  it("creates a 44px keyboard-accessible selected photobooth marker and disposes listener", async () => {
    const select = vi.fn();
    const marker = createPlaceMarker(
      {} as LibreMap,
      {
        id: "p",
        title: "Ảnh",
        category: "entertainment",
        subCategory: "photobooth",
        location: { lat: 10, lng: 106 },
      },
      true,
      select,
    );
    const button = mocks.markers[0]!.element;
    document.body.append(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.style.width).toBe("44px");
    expect(button).toHaveTextContent("📸");
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(select).toHaveBeenCalledOnce();
    marker.dispose();
    button.click();
    expect(select).toHaveBeenCalledOnce();
    expect(mocks.markers[0]?.remove).toHaveBeenCalledOnce();
    button.remove();
  });
});
describe("opt-in geolocation", () => {
  it.each([
    [1, "chưa cho phép"],
    [2, "không khả dụng"],
    [3, "quá thời gian"],
  ])(
    "handles error %s without moving default camera",
    async (code, message) => {
      const locate = vi.fn(
        (_success: PositionCallback, fail?: PositionErrorCallback | null) =>
          fail?.({ code, message: "error" } as GeolocationPositionError),
      );
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: locate },
      });
      render(<MapControls />);
      expect(locate).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole("button", { name: "Vị trí của tôi" }),
      );
      expect(screen.getByRole("status")).toHaveTextContent(String(message));
      expect(useMapStore.getState().center.lat).toBe(10.7769);
    },
  );
  it("updates camera without durable location storage", async () => {
    const locate = vi.fn((success: PositionCallback) =>
      success({
        coords: { latitude: 10, longitude: 106 },
      } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: locate },
    });
    render(<MapControls />);
    await userEvent.click(
      screen.getByRole("button", { name: "Vị trí của tôi" }),
    );
    expect(useMapStore.getState().center).toEqual({ lat: 10, lng: 106 });
  });
});
