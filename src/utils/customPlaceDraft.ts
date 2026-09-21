import { z } from "zod";
import { categorySchema } from "../domain/place";

const key = "smartfoodroute:custom-place-draft:v1";

const draftSchema = z.object({
  version: z.literal(1),
  name: z.string().max(120),
  category: categorySchema,
  address: z.string().max(500),
  googleMapsUrl: z.string().max(2048),
  isPrivate: z.boolean(),
  isFavorite: z.boolean(),
  budget: z.string().max(20),
  duration: z.string().max(8),
  subCategory: z.string().max(80),
  notes: z.string().max(3000),
  tags: z.string().max(1200),
});

export type CustomPlaceDraft = Omit<z.infer<typeof draftSchema>, "version">;

export const emptyCustomPlaceDraft: CustomPlaceDraft = {
  name: "",
  category: "start_point",
  address: "",
  googleMapsUrl: "",
  isPrivate: true,
  isFavorite: false,
  budget: "",
  duration: "60",
  subCategory: "",
  notes: "",
  tags: "",
};

function storage() {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function loadCustomPlaceDraft(): CustomPlaceDraft | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? {
          name: parsed.data.name,
          category: parsed.data.category,
          address: parsed.data.address,
          googleMapsUrl: parsed.data.googleMapsUrl,
          isPrivate: parsed.data.isPrivate,
          isFavorite: parsed.data.isFavorite,
          budget: parsed.data.budget,
          duration: parsed.data.duration,
          subCategory: parsed.data.subCategory,
          notes: parsed.data.notes,
          tags: parsed.data.tags,
        }
      : null;
  } catch {
    return null;
  }
}

export function saveCustomPlaceDraft(draft: CustomPlaceDraft) {
  try {
    storage()?.setItem(key, JSON.stringify({ version: 1, ...draft }));
  } catch {
    // Draft persistence is best-effort and must never block the form.
  }
}

export function clearCustomPlaceDraft() {
  try {
    storage()?.removeItem(key);
  } catch {
    // Ignore unavailable session storage.
  }
}

export function isMeaningfulCustomPlaceDraft(
  draft: CustomPlaceDraft | null,
): boolean {
  if (!draft) return false;
  return (
    !!draft.name.trim() ||
    !!draft.address.trim() ||
    !!draft.googleMapsUrl.trim() ||
    !!draft.budget.trim() ||
    !!draft.subCategory.trim() ||
    !!draft.notes.trim() ||
    !!draft.tags.trim() ||
    draft.category !== "start_point" ||
    !draft.isPrivate ||
    draft.isFavorite ||
    draft.duration !== "60"
  );
}

export function hasCustomPlaceDraft() {
  return isMeaningfulCustomPlaceDraft(loadCustomPlaceDraft());
}
