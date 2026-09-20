import { z } from "zod";
import { getSupabase } from "../lib/supabase";
import {
  publicSharedTourSchema,
  shareTokenSchema,
  type PublicSharedTour,
  type SaveTourInput,
} from "../domain/tour";

function rpcFailure(message: string, code?: string) {
  return new Error(
    code === "42501"
      ? "Phiên chưa đủ quyền. Hãy xác thực hai bước lại."
      : message,
  );
}

export async function saveTourSnapshot(input: SaveTourInput) {
  const title = z.string().trim().min(1).max(120).parse(input.title);
  const { data, error } = await getSupabase().rpc("save_tour_snapshot", {
    p_title: title,
    p_departure_at: input.departureAt,
    p_party_size: input.partySize,
    p_transport_mode: input.transportMode,
    p_total_distance_meters: input.totalDistanceMeters,
    p_total_travel_duration_seconds: input.totalTravelDurationSeconds,
    p_total_duration_minutes: input.totalDurationMinutes,
    p_total_estimated_budget: input.totalEstimatedBudget,
    p_stops: input.stops,
  });
  if (error)
    throw rpcFailure(
      "Không lưu được tour. Kiểm tra dữ liệu và thử lại.",
      error.code,
    );
  return z.uuid().parse(data);
}

export async function rotateShareToken(tourId: string) {
  const { data, error } = await getSupabase().rpc(
    "create_or_rotate_share_token",
    { p_tour_id: z.uuid().parse(tourId) },
  );
  if (error)
    throw rpcFailure("Không tạo được link chia sẻ.", error.code);
  return shareTokenSchema.parse(data);
}

export async function revokeShareToken(tourId: string) {
  const { error } = await getSupabase().rpc("revoke_share_token", {
    p_tour_id: z.uuid().parse(tourId),
  });
  if (error)
    throw rpcFailure("Không thu hồi được link chia sẻ.", error.code);
}

export async function getSharedTour(token: string): Promise<PublicSharedTour | null> {
  const parsedToken = shareTokenSchema.safeParse(token);
  if (!parsedToken.success) throw new Error("Link chia sẻ không hợp lệ.");
  const { data, error } = await getSupabase().rpc("get_shared_tour", {
    p_token: parsedToken.data,
  });
  if (error) throw new Error("Không tải được tour được chia sẻ.");
  if (data === null) return null;
  return publicSharedTourSchema.parse(data);
}
