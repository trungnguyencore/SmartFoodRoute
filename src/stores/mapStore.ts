import { create } from "zustand";
const initial = {
  center: { lat: 10.7769, lng: 106.7009 },
  zoom: 13,
  selectedId: null as string | null,
};
interface MapState {
  center: { lat: number; lng: number };
  zoom: number;
  selectedId: string | null;
  setView: (center: MapState["center"], zoom?: number) => void;
  select: (id: string | null) => void;
  reset: () => void;
}
export const useMapStore = create<MapState>((set) => ({
  ...initial,
  setView: (center, zoom) =>
    set((state) => ({ center, zoom: zoom ?? state.zoom })),
  select: (selectedId) => set({ selectedId }),
  reset: () => set(initial),
}));
