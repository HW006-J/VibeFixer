import { describe, expect, it } from "vitest";
import { buildSchemaInventory } from "./build-inventory";
import type { ScannedFile } from "../scanner/types";

function file(path: string, lines: string[]): ScannedFile {
  return { path, content: lines.join("\n") };
}

describe("buildSchemaInventory", () => {
  it("tracks a table's creation and policies", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", [
        "create table public.clients (id uuid primary key);",
        "alter table public.clients enable row level security;",
        'create policy "p" on public.clients for select to authenticated using (auth.uid() = owner_id);',
      ]),
    ]);

    const table = inventory.tables.get("public.clients");
    expect(table).toBeDefined();
    expect(table?.rlsEnabled).toBe(true);
    expect(table?.policies).toHaveLength(1);
    expect(inventory.policiesInspected).toBe(1);
  });

  it("defaults a table to rlsEnabled: false when RLS is never mentioned", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", ["create table public.clients (id uuid primary key);"]),
    ]);
    expect(inventory.tables.get("public.clients")?.rlsEnabled).toBe(false);
  });

  it("applies last-wins semantics for RLS enable/disable across statements", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", ["alter table public.t enable row level security;"]),
      file("supabase/migrations/0002.sql", ["alter table public.t disable row level security;"]),
    ]);
    expect(inventory.tables.get("public.t")?.rlsEnabled).toBe(false);
  });

  it("aggregates policies for the same table across multiple files", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", [
        'create policy "a" on public.t for select to authenticated using (true);',
      ]),
      file("supabase/migrations/0002.sql", [
        'create policy "b" on public.t for delete to authenticated using (true);',
      ]),
    ]);
    expect(inventory.tables.get("public.t")?.policies).toHaveLength(2);
    expect(inventory.policiesInspected).toBe(2);
  });

  it("counts non-OTHER statements towards statementsInspected", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", [
        "create table public.t (id uuid primary key);",
        "alter table public.t enable row level security;",
        'create policy "p" on public.t for select to authenticated using (true);',
        "insert into public.t (id) values ('x');", // OTHER — not counted
      ]),
    ]);
    expect(inventory.statementsInspected).toBe(3);
  });

  it("sets ownerColumnHint from a column's references auth.users(...) foreign key", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", [
        "create table public.clients (",
        "  id uuid primary key default gen_random_uuid(),",
        "  trainer_id uuid not null references auth.users(id) on delete cascade",
        ");",
      ]),
    ]);
    expect(inventory.tables.get("public.clients")?.ownerColumnHint).toBe("trainer_id");
  });

  it("leaves ownerColumnHint null when no column references auth.users", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", ["create table public.notes (id uuid primary key, body text);"]),
    ]);
    expect(inventory.tables.get("public.notes")?.ownerColumnHint).toBeNull();
  });

  it("parses createdAt and ownerColumnHint when CREATE TABLE is preceded by leading comment lines", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", [
        "-- Deliberately simplified schema for an authorised security demonstration.",
        "-- Do not deploy this fixture to a real production application.",
        "",
        "create table public.clients (",
        "  id uuid primary key default gen_random_uuid(),",
        "  trainer_id uuid not null references auth.users(id) on delete cascade",
        ");",
      ]),
    ]);
    const table = inventory.tables.get("public.clients");
    expect(table?.createdAt).not.toBeNull();
    expect(table?.ownerColumnHint).toBe("trainer_id");
  });

  it("discovers functions and views alongside tables and policies", () => {
    const inventory = buildSchemaInventory([
      file("supabase/migrations/0001.sql", [
        "create function public.f() returns int language sql security definer as $$ select 1; $$;",
        "create view public.v as select id from public.clients;",
      ]),
    ]);

    expect(inventory.functions).toHaveLength(1);
    expect(inventory.functions[0].name).toBe("public.f");
    expect(inventory.functions[0].securityDefiner).toBe(true);
    expect(inventory.views).toHaveLength(1);
    expect(inventory.views[0].name).toBe("public.v");
    expect(inventory.views[0].referencedTables).toContain("public.clients");
  });
});
