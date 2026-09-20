import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import {
  deletePlace,
  listPlannerPlaces,
  listSavedPlaces,
  savePlace,
} from "../services/placesService";
import { geoProvider } from "../services/geoProvider";
import type { PlaceDraft } from "../domain/place";
export function useSavedPlaces(page = 0) {
  const auth = useAuth();
  const userId = auth.session?.user.id;
  return useQuery({
    queryKey: ["saved-places", userId, page],
    queryFn: ({ signal }) => {
      if (!userId) throw new Error("Cần đăng nhập");
      return listSavedPlaces(userId, page, signal);
    },
    enabled: auth.access === "ready" && !!userId,
  });
}
export function usePlannerPlaces() {
  const auth = useAuth();
  const userId = auth.session?.user.id;
  return useQuery({
    queryKey: ["planner-places", userId],
    queryFn: ({ signal }) => {
      if (!userId) throw new Error("Cần đăng nhập");
      return listPlannerPlaces(userId, signal);
    },
    enabled: auth.access === "ready" && !!userId,
  });
}

export function usePlaceMutations() {
  const auth = useAuth();
  const query = useQueryClient();
  const userId = auth.session?.user.id;
  function owner() {
    if (!userId || auth.access !== "ready")
      throw new Error("Cần xác thực hai bước");
    return userId;
  }
  const invalidate = async () => {
    await Promise.all([
      query.invalidateQueries({ queryKey: ["saved-places", userId] }),
      query.invalidateQueries({ queryKey: ["planner-places", userId] }),
    ]);
  };
  return {
    save: useMutation({
      mutationFn: ({ draft, id }: { draft: PlaceDraft; id?: string }) =>
        savePlace(owner(), draft, id),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deletePlace(owner(), id),
      onSuccess: invalidate,
    }),
  };
}
export function useLivePlace(id: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["place", auth.session?.user.id, id],
    queryFn: ({ signal }) => {
      if (!id) throw new Error("Thiếu Place ID");
      return geoProvider.placeDetails(id, signal);
    },
    enabled: !!id && auth.access === "ready",
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
  });
}
