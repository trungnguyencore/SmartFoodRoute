import { z } from "zod";
import { getSupabase } from "../lib/supabase";
import { envResult } from "../lib/env";
import {
  geoPlaceSchema,
  geoRequestSchema,
  type GeoPlace,
  type GeoRequest,
} from "../../supabase/functions/_shared/geo";
import {
  routeMatrixResultSchema,
  routeResultSchema,
  type RouteMatrixResult,
  type RouteResult,
} from "../../supabase/functions/_shared/routing";

export type { GeoPlace, RouteMatrixResult, RouteResult };

type RequestOf<A extends GeoRequest["action"]> = Omit<
  Extract<GeoRequest, { action: A }>,
  "action"
>;

export type AutocompleteInput = RequestOf<"autocomplete">;
export type PlaceSearchInput = RequestOf<"places">;
export type RouteMatrixInput = RequestOf<"routeMatrix">;
export type RouteInput = RequestOf<"route">;
export interface GeoProvider {
  autocomplete(
    input: AutocompleteInput,
    signal?: AbortSignal,
  ): Promise<GeoPlace[]>;
  searchPlaces(
    input: PlaceSearchInput,
    signal?: AbortSignal,
  ): Promise<GeoPlace[]>;
  placeDetails(id: string, signal?: AbortSignal): Promise<GeoPlace>;
  reverseGeocode(
    input: { lat: number; lng: number },
    signal?: AbortSignal,
  ): Promise<GeoPlace | null>;
  routeMatrix(
    input: RouteMatrixInput,
    signal?: AbortSignal,
  ): Promise<RouteMatrixResult>;
  route(input: RouteInput, signal?: AbortSignal): Promise<RouteResult>;
}

export class GeoError extends Error {
  constructor(public status: number) {
    super(
      status === 401
        ? "Phiên đã hết hạn. Hãy đăng nhập lại."
        : status === 403
          ? "Cần xác thực hai bước hoặc kiểm tra origin được phép."
          : status === 429
            ? "Đã đạt hạn mức Geoapify. Hãy thử lại sau."
            : status === 400
              ? "Thông tin yêu cầu không hợp lệ."
              : status === 404
                ? "Không còn dữ liệu được yêu cầu."
                : status === 503
                  ? "Dịch vụ vị trí chưa sẵn sàng."
                  : status === 502
                    ? "Geoapify trả về dữ liệu không hợp lệ hoặc tạm thời không sẵn sàng."
                    : "Không kết nối được dịch vụ vị trí. Hãy thử lại.",
    );
  }
}

export class SupabaseGeoClient implements GeoProvider {
  private async call(input: GeoRequest, signal?: AbortSignal): Promise<unknown> {
    const body = geoRequestSchema.parse(input);
    if (!envResult.success) throw new GeoError(503);
    const { data, error } = await getSupabase().auth.getSession();
    if (error || !data.session) throw new GeoError(401);

    let response: Response;
    try {
      response = await fetch(
        new URL("/functions/v1/geo", envResult.data.VITE_SUPABASE_URL),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
            apikey: envResult.data.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
            : AbortSignal.timeout(12000),
        },
      );
    } catch (reason) {
      if (signal?.aborted) throw reason;
      throw new GeoError(0);
    }

    if (!response.ok) throw new GeoError(response.status);
    try {
      return await response.json();
    } catch {
      throw new GeoError(502);
    }
  }

  private async placesRequest(input: GeoRequest, signal?: AbortSignal) {
    const parsed = z
      .object({ places: z.array(geoPlaceSchema) })
      .safeParse(await this.call(input, signal));
    if (!parsed.success) throw new GeoError(502);
    return parsed.data.places;
  }

  autocomplete(input: AutocompleteInput, signal?: AbortSignal) {
    return this.placesRequest({ action: "autocomplete", ...input }, signal);
  }

  searchPlaces(input: PlaceSearchInput, signal?: AbortSignal) {
    return this.placesRequest({ action: "places", ...input }, signal);
  }

  async placeDetails(providerPlaceId: string, signal?: AbortSignal) {
    const places = await this.placesRequest(
      { action: "placeDetails", providerPlaceId },
      signal,
    );
    if (!places[0]) throw new GeoError(404);
    return places[0];
  }

  async reverseGeocode(
    input: { lat: number; lng: number },
    signal?: AbortSignal,
  ) {
    return (
      (await this.placesRequest(
        { action: "reverseGeocode", ...input },
        signal,
      ))[0] ?? null
    );
  }

  async routeMatrix(input: RouteMatrixInput, signal?: AbortSignal) {
    const parsed = z
      .object({ matrix: routeMatrixResultSchema })
      .safeParse(await this.call({ action: "routeMatrix", ...input }, signal));
    if (!parsed.success) throw new GeoError(502);
    return parsed.data.matrix;
  }

  async route(input: RouteInput, signal?: AbortSignal) {
    const parsed = z
      .object({ route: routeResultSchema })
      .safeParse(await this.call({ action: "route", ...input }, signal));
    if (!parsed.success) throw new GeoError(502);
    return parsed.data.route;
  }
}

export const geoProvider: GeoProvider = new SupabaseGeoClient();
