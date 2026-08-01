import { describe, expect, it } from "vitest";
import { findOwnerColumnHint } from "./find-owner-column";

describe("findOwnerColumnHint", () => {
  it("finds the column with an inline references auth.users(...) foreign key", () => {
    const statement = `create table public.clients (
      id uuid primary key default gen_random_uuid(),
      trainer_id uuid not null references auth.users(id) on delete cascade,
      name text not null
    );`;

    expect(findOwnerColumnHint(statement)).toBe("trainer_id");
  });

  it("does not match a column with no reference to auth.users", () => {
    const statement = `create table public.notes (
      id uuid primary key default gen_random_uuid(),
      body text not null
    );`;

    expect(findOwnerColumnHint(statement)).toBeNull();
  });

  it("does not invent a column when the table has a foreign key to a different table", () => {
    const statement = `create table public.line_items (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.orders(id)
    );`;

    expect(findOwnerColumnHint(statement)).toBeNull();
  });

  it("returns null for a statement with no parenthesised column list", () => {
    expect(findOwnerColumnHint("create table public.t")).toBeNull();
  });

  it("finds the correct column even when other columns also use gen_random_uuid() defaults with parens", () => {
    const statement = `create table public.orders (
      id uuid primary key default gen_random_uuid(),
      customer_id uuid not null references auth.users(id),
      total numeric(10, 2) not null default 0
    );`;

    expect(findOwnerColumnHint(statement)).toBe("customer_id");
  });
});
