import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCustomPlaceDraft,
  emptyCustomPlaceDraft,
  hasCustomPlaceDraft,
  loadCustomPlaceDraft,
  saveCustomPlaceDraft,
} from "./customPlaceDraft";

describe("custom place draft session persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips meaningful draft data in sessionStorage", () => {
    saveCustomPlaceDraft({
      ...emptyCustomPlaceDraft,
      name: "Tiệm hoa",
      category: "other",
      subCategory: "Tiệm hoa",
      googleMapsUrl: "https://maps.app.goo.gl/test",
    });
    expect(hasCustomPlaceDraft()).toBe(true);
    expect(loadCustomPlaceDraft()).toMatchObject({
      name: "Tiệm hoa",
      category: "other",
      subCategory: "Tiệm hoa",
    });
  });

  it("clears drafts and ignores malformed storage", () => {
    saveCustomPlaceDraft({ ...emptyCustomPlaceDraft, name: "Nháp" });
    clearCustomPlaceDraft();
    expect(loadCustomPlaceDraft()).toBeNull();
    sessionStorage.setItem("smartfoodroute:custom-place-draft:v1", "{bad");
    expect(loadCustomPlaceDraft()).toBeNull();
  });
});
