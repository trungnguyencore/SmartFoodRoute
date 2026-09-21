import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

const A = "10000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
const PA = "30000000-0000-4000-8000-000000000003";
const PB = "40000000-0000-4000-8000-000000000004";
const TA = "50000000-0000-4000-8000-000000000005";
const TB = "60000000-0000-4000-8000-000000000006";
const db = new PGlite({ extensions: { pgcrypto } });
let migratedRows: Record<string, unknown>[] = [];
async function identity(role: "anon" | "authenticated", sub = A, aal = "aal2") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub, aal }),
  ]);
  await db.exec("set role " + role);
}
async function scalar(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows[0]?.v;
}
beforeAll(async () => {
  // Test-only stand-in for the Supabase Auth schema/JWT helper functions.
  // Migrations and PostgreSQL policy execution themselves are real and unmodified.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select nullif(current_setting('request.jwt.claims', true),'')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
  `);
  for (const file of readdirSync("supabase/migrations").sort()) {
    if (file === "202609200001_provider_neutral_places.sql") {
      await db.query("insert into auth.users(id) values ($1)", [A]);
      await db.query(
        "insert into public.saved_places(user_id,source,category,google_place_id,custom_label,notes) values($1,'google','food','legacy-id','Original alias','Keep this note')",
        [A],
      );
      await db.query(
        "insert into public.saved_places(user_id,source,category,custom_label,custom_lat,custom_lng) values($1,'custom','start_point','Original home',10.1,106.1)",
        [A],
      );
    }
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    if (file === "202609200001_provider_neutral_places.sql")
      migratedRows = (
        await db.query<Record<string, unknown>>(
          "select * from public.saved_places order by name",
        )
      ).rows;
  }
});
beforeEach(async () => {
  await db.exec("reset role");
  await db.exec("truncate auth.users cascade");
  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  await db.query(
    `insert into public.saved_places(id,user_id,source,category,name,lat,lng)
    values ($1,$2,'custom','start_point','Private home',10.123,106.456),
           ($3,$4,'custom','food','B secret',11,107)`,
    [PA, A, PB, B],
  );
  await db.query(
    `insert into public.saved_tours(id,user_id,title,departure_at)
    values ($1,$2,'A tour',now()),($3,$4,'B tour',now())`,
    [TA, A, TB, B],
  );
  await db.query(
    `insert into public.tour_stops(tour_id,user_id,position,category,saved_place_id,name_snapshot,lat_snapshot,lng_snapshot)
    values($1,$2,0,'start_point',$3,'Private home',10.123,106.456)`,
    [TA, A, PA],
  );
  await identity("authenticated");
});
afterAll(async () => {
  await db.close();
});

describe("actual PostgreSQL RLS and security RPCs", () => {
  it("forward upgrade preserves old Google/custom rows without invented coordinates", () => {
    expect(migratedRows).toHaveLength(2);
    expect(migratedRows[0]).toMatchObject({
      source: "custom",
      name: "Original alias",
      notes: "Keep this note",
      legacy_google_place_id: "legacy-id",
      lat: null,
      lng: null,
      needs_location: true,
      user_id: A,
    });
    expect(migratedRows[1]).toMatchObject({
      source: "custom",
      name: "Original home",
      lat: 10.1,
      lng: 106.1,
      needs_location: false,
      is_private: true,
    });
  });
  it("forward category migration adds drink without rewriting legacy food", async () => {
    await db.query(
      "insert into public.saved_places(user_id,source,category,name,lat,lng) values($1,'custom','drink','Trà tối',10.2,106.2)",
      [A],
    );
    expect(
      await scalar(
        "select category::text as v from public.saved_places where name='Trà tối'",
      ),
    ).toBe("drink");
    expect(
      await scalar(
        "select category::text as v from public.saved_places where id=$1",
        [PB],
      ),
    ).toBeUndefined();
    await identity("authenticated", B);
    expect(
      await scalar(
        "select category::text as v from public.saved_places where id=$1",
        [PB],
      ),
    ).toBe("food");
  });

  it("new clients cannot invent unresolved legacy rows", async () => {
    await expect(
      db.query(
        "insert into public.saved_places(user_id,source,category,name,legacy_google_place_id,needs_location) values($1,'custom','food','Bad','invented',true)",
        [A],
      ),
    ).rejects.toThrow("read only");
    await expect(
      db.query(
        "update public.saved_places set needs_location=true,legacy_google_place_id='invented',lat=null,lng=null where id=$1",
        [PA],
      ),
    ).rejects.toThrow("read only");
  });
  it("provider ID uniqueness is user-scoped and coordinates are required", async () => {
    const sql =
      "insert into public.saved_places(user_id,source,category,name,provider_place_id,lat,lng) values($1,'geoapify','food','POI','same-provider-id',10,106)";
    await db.query(sql, [A]);
    await expect(db.query(sql, [A])).rejects.toThrow();
    await identity("authenticated", B);
    await db.query(sql, [B]);
    await expect(
      db.query(
        "insert into public.saved_places(user_id,source,category,name,provider_place_id) values($1,'geoapify','food','Missing coordinates','no-coords')",
        [B],
      ),
    ).rejects.toThrow();
  });
  it("atomic quota limits caller across requests; other owners remain independent", async () => {
    for (let i = 0; i < 30; i++)
      expect(await scalar("select public.consume_geo_quota() as v")).toBe(true);
    expect(await scalar("select public.consume_geo_quota() as v")).toBe(false);
    await identity("authenticated", B);
    expect(await scalar("select public.consume_geo_quota() as v")).toBe(true);
    await expect(db.query("select * from public.geo_quota")).rejects.toThrow();
    await identity("authenticated", A, "aal1");
    await expect(
      db.query("select public.consume_geo_quota()"),
    ).rejects.toThrow();
    await identity("anon");
    await expect(
      db.query("select public.consume_geo_quota()"),
    ).rejects.toThrow();
  });
  it("rejects malicious stored external links at database boundary", async () => {
    for (const url of [
      "javascript:alert(1)",
      "https://www.google.com.evil/maps/x",
      "https://user@www.google.com/maps/x",
    ])
      await expect(
        db.query(
          "update public.saved_places set google_maps_url=$1 where id=$2",
          [url, PA],
        ),
      ).rejects.toThrow();
  });
  it("AAL2 reads own rows only", async () => {
    expect(
      await scalar("select count(*)::int as v from public.saved_places"),
    ).toBe(1);
    expect(await scalar("select name as v from public.saved_places")).toBe(
      "Private home",
    );
  });
  it("AAL1 cannot read protected tables or insert data", async () => {
    await identity("authenticated", A, "aal1");
    for (const table of [
      "saved_places",
      "cinema_provider_links",
      "saved_tours",
      "tour_stops",
      "cost_presets",
    ]) {
      expect(
        await scalar("select count(*)::int as v from public." + table),
      ).toBe(0);
    }
    await expect(
      db.query(
        `insert into public.cost_presets(user_id,category,label,amount_per_person) values($1,'food','x',1)`,
        [A],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select public.create_or_rotate_share_token($1)", [TA]),
    ).rejects.toThrow();
  });
  it("A cannot update/delete B rows or take ownership", async () => {
    for (const table of ["saved_places", "saved_tours"]) {
      const id = table === "saved_places" ? PB : TB;
      expect(
        (
          await db.query(
            "delete from public." + table + " where id=$1 returning id",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
    }
    expect(
      (
        await db.query(
          "update public.saved_tours set title='stolen' where id=$1 returning id",
          [TB],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("update public.saved_places set user_id=$1 where id=$2", [
        B,
        PA,
      ]),
    ).rejects.toThrow();
  });
  it("rejects cross-owner parent references at the DB boundary", async () => {
    await expect(
      db.query(
        `insert into public.tour_stops(tour_id,user_id,position,category,name_snapshot)
      values($1,$2,1,'food','x')`,
        [TB, A],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into public.cinema_provider_links(user_id,saved_place_id,provider,provider_cinema_id,provider_cinema_url)
      values($1,$2,'moveek','test-cinema','https://moveek.com/rap/test/')`,
        [A, PB],
      ),
    ).rejects.toThrow();
  });
  it("rejects legacy sources and requires a provider ID", async () => {
    await expect(
      db.query(
        `insert into public.saved_places(user_id,source,category,provider_place_id,name,lat,lng)
      values($1,'google','food','test-place','POI',10,106)`,
        [A],
      ),
    ).rejects.toThrow();
    await db.query(
      `insert into public.saved_places(user_id,source,category,provider_place_id,name,lat,lng)
      values($1,'geoapify','food','test-place','POI',10,106)`,
      [A],
    );
  });
  it("custom locations default private and timestamps update", async () => {
    expect(
      await scalar(
        "select is_private as v from public.saved_places where id=$1",
        [PA],
      ),
    ).toBe(true);
    await db.query(
      "update public.saved_places set name='New alias' where id=$1",
      [PA],
    );
    expect(
      await scalar(
        "select updated_at >= created_at as v from public.saved_places where id=$1",
        [PA],
      ),
    ).toBe(true);
  });
  it("anonymous cannot select any private table", async () => {
    await identity("anon");
    for (const table of [
      "profiles",
      "saved_places",
      "cinema_provider_links",
      "saved_tours",
      "tour_stops",
      "cost_presets",
    ]) {
      await expect(db.query("select * from public." + table)).rejects.toThrow();
    }
  });
  it("only an exact valid token exposes a minimal sanitized tour", async () => {
    const token = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    await identity("anon");
    const dto = await scalar("select public.get_shared_tour($1) as v", [token]);
    expect(dto).toMatchObject({
      title: "A tour",
      stops: [
        {
          label: "Điểm bắt đầu riêng tư",
          isPrivate: true,
          lat: null,
          lng: null,
          providerPlaceId: null,
        },
      ],
    });
    const serialized = JSON.stringify(dto);
    for (const privateValue of [
      A,
      PA,
      "Private home",
      "10.123",
      "106.456",
      "B tour",
      "user_id",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(
      await scalar("select public.get_shared_tour($1) as v", [B]),
    ).toBeNull();
  });
  it("owner RPC rejects another user and a missing AAL claim", async () => {
    await expect(
      db.query("select public.create_or_rotate_share_token($1)", [TB]),
    ).rejects.toThrow();
    await identity("authenticated", A, "");
    await expect(
      db.query("select public.delete_my_app_data()"),
    ).rejects.toThrow();
  });
  it("rotation, expiration and revocation invalidate old tokens", async () => {
    const old = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    const fresh = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    expect(fresh).not.toBe(old);
    expect(
      await scalar("select public.get_shared_tour($1) as v", [old]),
    ).toBeNull();
    await db.exec("reset role");
    await db.query(
      "update public.saved_tours set share_expires_at=now()-interval '1 second' where id=$1",
      [TA],
    );
    await identity("anon");
    expect(
      await scalar("select public.get_shared_tour($1) as v", [fresh]),
    ).toBeNull();
    await identity("authenticated");
    const next = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    await db.query("select public.revoke_share_token($1)", [TA]);
    await identity("anon");
    expect(
      await scalar("select public.get_shared_tour($1) as v", [next]),
    ).toBeNull();
  });
  it("share flags cannot be set through a direct table write", async () => {
    await expect(
      db.query(
        "update public.saved_tours set share_token=$1,is_shared=true where id=$2",
        [B, TA],
      ),
    ).rejects.toThrow();
  });
  it("delete app data only deletes caller data", async () => {
    await db.query("select public.delete_my_app_data()");
    expect(
      await scalar("select count(*)::int as v from public.saved_places"),
    ).toBe(0);
    await identity("authenticated", B);
    expect(
      await scalar("select count(*)::int as v from public.saved_places"),
    ).toBe(1);
    expect(
      await scalar("select count(*)::int as v from public.saved_tours"),
    ).toBe(1);
  });
  it("AAL1 cannot mutate any protected table", async () => {
    await identity("authenticated", A, "aal1");
    const inserts = [
      [
        "insert into public.saved_places(user_id,source,category,provider_place_id,name,lat,lng) values($1,'geoapify','food','g','POI',10,106)",
        [A],
      ],
      [
        "insert into public.cinema_provider_links(user_id,saved_place_id,provider,provider_cinema_id,provider_cinema_url) values($1,$2,'moveek','test-cinema','https://moveek.com/rap/test')",
        [A, PA],
      ],
      [
        "insert into public.saved_tours(user_id,title,departure_at) values($1,'x',now())",
        [A],
      ],
      [
        "insert into public.tour_stops(user_id,tour_id,position,category,name_snapshot) values($1,$2,1,'food','x')",
        [A, TA],
      ],
    ] satisfies [string, string[]][];
    for (const [sql, args] of inserts)
      await expect(db.query(sql, args)).rejects.toThrow();
    expect(
      (
        await db.query(
          "update public.saved_places set name='bad' where id=$1 returning id",
          [PA],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "delete from public.saved_tours where id=$1 returning id",
          [TA],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.revoke_share_token($1)", [TA]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.delete_my_app_data()"),
    ).rejects.toThrow();
  });
  it("all private tables have RLS enabled and protected tables have restrictive AAL2 policies", async () => {
    await db.exec("reset role");
    for (const table of [
      "profiles",
      "saved_places",
      "cinema_provider_links",
      "saved_tours",
      "tour_stops",
      "cost_presets",
    ]) {
      expect(
        await scalar(
          "select relrowsecurity as v from pg_class where oid=('public.'||$1)::regclass",
          [table],
        ),
      ).toBe(true);
      if (table !== "profiles")
        expect(
          await scalar(
            "select count(*)::int as v from pg_policies where schemaname='public' and tablename=$1 and permissive='RESTRICTIVE'",
            [table],
          ),
        ).toBe(1);
    }
  });
  it("private linked places remain redacted even if the stop flag is false", async () => {
    await db.query(
      "update public.tour_stops set category='food',is_private=false where tour_id=$1",
      [TA],
    );
    const token = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    await identity("anon");
    expect(
      await scalar("select public.get_shared_tour($1) as v", [token]),
    ).toMatchObject({
      stops: [
        { label: "Địa điểm riêng tư", isPrivate: true, lat: null, lng: null },
      ],
    });
  });
  it("retains public stops while excluding another tour and private fields", async () => {
    await db.query(
      `insert into public.tour_stops(tour_id,user_id,position,category,name_snapshot,provider_place_id)
      values($1,$2,1,'food','User alias','public-place-id')`,
      [TA, A],
    );
    const token = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    await identity("anon");
    const dto = await scalar("select public.get_shared_tour($1) as v", [token]);
    expect(dto).toMatchObject({
      stops: [
        { isPrivate: true },
        {
          label: "User alias",
          providerPlaceId: "public-place-id",
          isPrivate: false,
        },
      ],
    });
    expect(JSON.stringify(dto)).not.toContain("B tour");
  });
  it("deleting a saved place preserves its tour stop without changing ownership", async () => {
    await db.query("delete from public.saved_places where id=$1", [PA]);
    expect(
      await scalar(
        "select saved_place_id as v from public.tour_stops where tour_id=$1",
        [TA],
      ),
    ).toBeNull();
    expect(
      await scalar(
        "select user_id as v from public.tour_stops where tour_id=$1",
        [TA],
      ),
    ).toBe(A);
  });
  it("deleting a linked private place cannot accidentally disclose its snapshot", async () => {
    await db.query(
      "update public.tour_stops set category='food',is_private=false where tour_id=$1",
      [TA],
    );
    await db.query("delete from public.saved_places where id=$1", [PA]);
    const token = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [TA],
    );
    await identity("anon");
    expect(
      await scalar("select public.get_shared_tour($1) as v", [token]),
    ).toMatchObject({
      stops: [
        { label: "Địa điểm riêng tư", lat: null, lng: null, isPrivate: true },
      ],
    });
  });
  it("atomically saves a v3 tour snapshot and exposes the safe DTO only", async () => {
    const stops = JSON.stringify([
      {
        position: 0,
        savedPlaceId: PA,
        nameSnapshot: "Private home",
        category: "start_point",
        latSnapshot: 10.123,
        lngSnapshot: 106.456,
        addressSnapshot: "Private address",
        durationMinutes: 0,
        isPrivate: true,
      },
    ]);
    const tourId = await scalar(
      `select public.save_tour_snapshot(
        $1,$2::timestamptz,$3::integer,$4,$5::integer,$6::integer,
        $7::integer,$8::integer,$9::jsonb
      ) as v`,
      ["Phase 9 tour", "2026-09-20T10:00:00Z", 2, "MOTORCYCLE", 1200, 600, 90, 250000, stops],
    );
    expect(tourId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      await scalar("select count(*)::int as v from public.saved_tours"),
    ).toBe(2);
    const token = await scalar(
      "select public.create_or_rotate_share_token($1) as v",
      [tourId],
    );
    await identity("anon");
    const dto = await scalar("select public.get_shared_tour($1) as v", [token]);
    expect(dto).toMatchObject({
      id: tourId,
      title: "Phase 9 tour",
      totalDurationMinutes: 90,
      totalBudget: 250000,
      stops: [{
        name: "Điểm bắt đầu riêng tư",
        isPrivate: true,
        lat: null,
        lng: null,
        address: null,
      }],
    });
    expect(JSON.stringify(dto)).not.toContain("Private address");
  });
  it("rolls back the whole save when a stop references another owner", async () => {
    const before = await scalar(
      "select count(*)::int as v from public.saved_tours",
    );
    const stops = JSON.stringify([
      {
        position: 0,
        savedPlaceId: PA,
        nameSnapshot: "Private home",
        category: "start_point",
        latSnapshot: 10.123,
        lngSnapshot: 106.456,
        durationMinutes: 0,
        isPrivate: true,
      },
      {
        position: 1,
        savedPlaceId: PB,
        nameSnapshot: "Not mine",
        category: "food",
        latSnapshot: 11,
        lngSnapshot: 107,
        durationMinutes: 60,
        isPrivate: false,
      },
    ]);
    await expect(
      db.query(
        `select public.save_tour_snapshot(
          $1,$2::timestamptz,$3::integer,$4,$5::integer,$6::integer,
          $7::integer,$8::integer,$9::jsonb
        )`,
        ["Should rollback", "2026-09-20T10:00:00Z", 2, "MOTORCYCLE", 1200, 600, 90, 250000, stops],
      ),
    ).rejects.toThrow();
    expect(
      await scalar("select count(*)::int as v from public.saved_tours"),
    ).toBe(before);
  });
});
