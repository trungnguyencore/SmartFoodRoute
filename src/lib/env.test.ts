import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";
const base = {
  VITE_SUPABASE_URL: "https://test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
};
describe("environment boundary", () => {
  it("fails closed with missing config", () =>
    expect(parseEnv({}).success).toBe(false));
  it("accepts public keys", () => expect(parseEnv(base).success).toBe(true));
  it("rejects server secret keys", () =>
    expect(
      parseEnv({
        ...base,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test_only",
      }).success,
    ).toBe(false));
  it("rejects service-role JWTs", () => {
    const key =
      "header." + btoa(JSON.stringify({ role: "service_role" })) + ".test";
    expect(
      parseEnv({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: key }).success,
    ).toBe(false);
  });
  it("requires explicit absolute base path", () =>
    expect(parseEnv({ ...base, VITE_BASE_PATH: "./" }).success).toBe(false));
});
