import { useEffect, useRef, useState } from "react";
import {
  Map as LibreMap,
  NavigationControl,
  AttributionControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource } from "maplibre-gl";
import { MapPin } from "lucide-react";
import { mapTilerStyleUrl } from "../../lib/mapStyle";
import { mapsConfig } from "../../lib/env";
import { useMapStore } from "../../stores/mapStore";
import { createPlaceMarker } from "./PlaceMarker";
import { MapControls } from "./MapControls";
import type { MapPlace } from "../../domain/place";
import type { RouteResult } from "../../services/geoProvider";
const noPlaces: MapPlace[] = [];
// MapLibre v6 requires a bundled worker URL; plain ?url loses sibling imports.
setWorkerUrl(workerUrl);
export function MapCanvas({
  places = noPlaces,
  route = null,
}: {
  places?: MapPlace[];
  route?: RouteResult | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<LibreMap | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const center = useMapStore((s) => s.center),
    zoom = useMapStore((s) => s.zoom);
  const selected = useMapStore((s) => s.selectedId);
  useEffect(() => {
    let active = true,
      map: LibreMap | undefined,
      observer: ResizeObserver | undefined;
    let cleanup = () => {};
    setError("");
    setInstance(null);
    setLoaded(false);
    async function initialize() {
      const style = mapTilerStyleUrl(mapsConfig.key);
      // Yield so StrictMode's abandoned mount never allocates a WebGL instance.
      await Promise.resolve();
      if (!active || !container.current) return;
      const initial = useMapStore.getState();
      map = new LibreMap({
        container: container.current,
        style,
        center: [initial.center.lng, initial.center.lat],
        zoom: initial.zoom,
        attributionControl: false,
      });
      const current = map;
      current.addControl(new NavigationControl(), "top-right");
      current.addControl(
        new AttributionControl({ compact: false }),
        "bottom-right",
      );
      const move = () => {
        const c = current.getCenter();
        useMapStore
          .getState()
          .setView({ lat: c.lat, lng: c.lng }, current.getZoom());
      };
      const fail = () => {
        if (active)
          setError(
            "Không tải được bản đồ MapTiler. Kiểm tra kết nối, hạn mức và Allowed HTTP Origins.",
          );
      };
      const load = () => {
        if (!active) return;
        setLoaded(true);
        setError("");
        // Phase 8 route source; populated only after a final Geoapify route succeeds.
        current.addSource("route-preview", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        current.addLayer({
          id: "route-preview-line",
          type: "line",
          source: "route-preview",
          paint: { "line-color": "#bc381c", "line-width": 5 },
        });
      };
      current.on("moveend", move);
      current.on("error", fail);
      current.on("load", load);
      const timeout = window.setTimeout(() => {
        if (!current.loaded()) fail();
      }, 15000);
      observer = new ResizeObserver(() => current.resize());
      observer.observe(container.current);
      cleanup = () => {
        window.clearTimeout(timeout);
        current.off("moveend", move);
        current.off("error", fail);
        current.off("load", load);
      };
      setInstance(current);
    }
    void initialize().catch(() => {
      if (active)
        setError(
          mapsConfig.key
            ? "Không khởi tạo được bản đồ. Kiểm tra WebGL và kết nối."
            : "Thiếu VITE_MAPTILER_API_KEY. Danh sách và địa điểm riêng vẫn dùng được.",
        );
    });
    return () => {
      active = false;
      cleanup();
      observer?.disconnect();
      map?.remove();
    };
  }, [attempt]);
  useEffect(() => {
    if (!instance) return;
    const c = instance.getCenter();
    if (
      Math.abs(c.lat - center.lat) > 0.000001 ||
      Math.abs(c.lng - center.lng) > 0.000001 ||
      Math.abs(instance.getZoom() - zoom) > 0.001
    )
      instance.jumpTo({ center: [center.lng, center.lat], zoom });
  }, [instance, center, zoom]);
  useEffect(() => {
    if (!instance) return;
    const markers = places.map((place) =>
      createPlaceMarker(instance, place, selected === place.id, () => {
        useMapStore.getState().select(place.id);
        useMapStore.getState().setView(place.location);
      }),
    );
    return () => markers.forEach((marker) => marker.dispose());
  }, [instance, places, selected]);

  useEffect(() => {
    if (!instance || !loaded) return;
    const source = instance.getSource("route-preview") as
      | GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData(
      route
        ? {
            type: "Feature",
            properties: {},
            geometry: route.geometry,
          }
        : { type: "FeatureCollection", features: [] },
    );
  }, [instance, loaded, route]);

  return (
    <section className="map-region" aria-label="Bản đồ địa điểm">
      <div ref={container} className="map-canvas" />
      {error ? (
        <div className="map-fallback">
          <MapPin size={36} aria-hidden="true" />
          <h2>Bản đồ chưa sẵn sàng</h2>
          <p role="alert">{error}</p>
          <button
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Thử tải lại
          </button>
        </div>
      ) : (
        !loaded && (
          <div role="status" className="map-fallback">
            Đang tải bản đồ…
          </div>
        )
      )}
      {!error && loaded && <MapControls />}
    </section>
  );
}
