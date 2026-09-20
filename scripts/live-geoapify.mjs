// Compatibility wrapper: Geoapify live checks are part of the canonical live security run.
process.argv[2] = "security";
await import("./live-supabase.mjs");
