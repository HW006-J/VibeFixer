// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { UnifiedFinding } from "@/lib/security/finding";
import { CommandPalette } from "./command-palette";
import { FindabilityProvider } from "./findability-context";
import { Section } from "./section";
import { SectionRail } from "./section-rail";
import { ThemeToggle } from "./theme-toggle";

/*
 * Covers the findability chrome: the command palette, the section rail and the
 * theme toggle.
 *
 * These assert behaviour and accessible structure — roles, names, aria-current,
 * aria-activedescendant — never class names. The findings list itself is
 * covered by scan-result.test.tsx; what is tested here is the machinery that
 * makes a specific finding reachable without reading the whole page.
 */

/*
 * jsdom implements neither layout nor media queries, so it ships no
 * `scrollIntoView` and no `matchMedia`. The components under test use both —
 * one to keep the active option in view, the other to honour
 * `prefers-reduced-motion`. Stubbing them keeps these tests about behaviour
 * rather than about jsdom's gaps; both APIs exist in every supported browser.
 *
 * `matches: false` means "no explicit preference", which is the default worth
 * testing against: motion enabled, and the OS theme reported as dark.
 */
beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function finding(overrides: Partial<UnifiedFinding> = {}): UnifiedFinding {
  return {
    id: "supabase|clients|allow-all",
    ruleId: "SUPA-RLS-001",
    category: "supabase",
    severity: "critical",
    confidence: "high",
    title: "Allow-all RLS policy on public.clients",
    impact: "Every authenticated user can read every row.",
    recommendation: "Scope the expression to the requesting user.",
    filePath: "supabase/migrations/0001_init.sql",
    startLine: 12,
    endLine: 14,
    redactedEvidence: "USING (true)",
    assumptions: null,
    verification: "static",
    ...overrides,
  };
}

const SECRET_FINDING = finding({
  id: "secret|env|key",
  ruleId: "SEC-KEY-004",
  category: "secret",
  severity: "high",
  title: "Service key committed to the repository",
  filePath: "src/lib/config.ts",
});

const REVIEW_FINDING = finding({
  id: "iam|wildcard",
  ruleId: "IAM-WILD-002",
  category: "iam",
  severity: "review",
  title: "IAM wildcard action needs manual review",
  filePath: "infra/policy.json",
});

function renderChrome(findings: UnifiedFinding[] = [finding()], children?: React.ReactNode) {
  return render(
    <FindabilityProvider findings={findings} report={null} repository="acme/demo" isScanning={false}>
      <SectionRail />
      <CommandPalette />
      {children}
    </FindabilityProvider>,
  );
}

function openPalette() {
  fireEvent.keyDown(document, { key: "k", metaKey: true });
}

/*
 * Closes the palette and waits for it to actually leave the DOM.
 *
 * AnimatePresence keeps an exiting subtree mounted until its exit animation
 * finishes, so "is it gone" is only answerable asynchronously. Tests that
 * assert closure — or that reopen and expect fresh state — have to wait, or
 * they race the animation and read the outgoing dialog.
 */
async function closePalette() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("command palette", () => {
  it("opens on Cmd-K and closes on Escape", async () => {
    renderChrome();
    expect(screen.queryByRole("dialog")).toBeNull();

    openPalette();
    expect(screen.getByRole("dialog", { name: /search findings and sections/i })).toBeTruthy();

    await closePalette();
  });

  it("opens on the / shortcut only when the user is not already typing", () => {
    renderChrome();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "/" });
    expect(screen.queryByRole("dialog")).toBeNull();
    input.remove();

    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("suggests the most severe findings before anything is typed", () => {
    renderChrome([SECRET_FINDING, finding()]);
    openPalette();

    const options = screen.getAllByRole("option");
    // Critical outranks high, so the allow-all policy leads regardless of
    // the order the findings arrived in.
    expect(options[0].textContent).toContain("Allow-all RLS policy");
  });

  it("finds a finding by its rule id", () => {
    renderChrome([finding(), SECRET_FINDING]);
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "SEC-KEY" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("Service key committed");
  });

  it("finds a finding by its file path", () => {
    renderChrome([finding(), SECRET_FINDING]);
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "config.ts" } });

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Service key committed");
  });

  it("finds findings by severity word", () => {
    renderChrome([finding(), SECRET_FINDING, REVIEW_FINDING]);
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "critical" } });

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("Allow-all RLS policy");
  });

  it("ranks a title match above a file-path match", () => {
    const pathOnly = finding({
      id: "other",
      title: "Unrelated finding",
      ruleId: "OTHER-1",
      filePath: "supabase/migrations/clients.sql",
    });
    const titleMatch = finding({ id: "titled", title: "clients table exposed", ruleId: "T-1" });

    renderChrome([pathOnly, titleMatch]);
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "clients" } });

    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toContain("clients table exposed");
  });

  it("shows a purpose-built no-results state naming the query", () => {
    renderChrome();
    openPalette();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzz" } });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/no match for/i).textContent).toContain("zzzz");
    expect(screen.getByText(/try a rule id, a file path/i)).toBeTruthy();
  });

  it("tells the user there is nothing to search before a scan has run", () => {
    renderChrome([]);
    openPalette();

    expect(screen.getByText(/nothing to search yet/i)).toBeTruthy();
    expect(screen.getByText(/scan a repository first/i)).toBeTruthy();
  });

  it("moves the active option with the arrow keys and reports it via aria-activedescendant", () => {
    renderChrome([finding(), SECRET_FINDING]);
    openPalette();

    const combobox = screen.getByRole("combobox");
    const options = screen.getAllByRole("option");

    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(combobox.getAttribute("aria-activedescendant")).toBe(options[0].id);

    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    expect(combobox.getAttribute("aria-activedescendant")).toBe(options[1].id);
  });

  it("wraps around when arrowing past either end", () => {
    renderChrome([finding(), SECRET_FINDING]);
    openPalette();
    const combobox = screen.getByRole("combobox");

    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
  });

  it("keeps focus inside the dialog when Tab is pressed", () => {
    renderChrome();
    openPalette();

    const combobox = screen.getByRole("combobox");
    const tab = fireEvent.keyDown(combobox, { key: "Tab" });
    // fireEvent returns false when preventDefault was called.
    expect(tab).toBe(false);
  });

  it("resets the query between openings rather than remembering it", async () => {
    renderChrome();

    openPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzz" } });
    await closePalette();

    openPalette();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });

  it("records a chosen finding as recent and offers it first next time", async () => {
    renderChrome([finding(), SECRET_FINDING]);

    openPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "SEC-KEY" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    openPalette();
    expect(within(screen.getByRole("listbox")).getByText(/^Recent$/)).toBeTruthy();
    expect(screen.getAllByRole("option")[0].textContent).toContain("Service key committed");
  });
});

describe("section rail", () => {
  it("lists sections that registered themselves, in declared order", () => {
    renderChrome(
      [],
      <>
        <Section id="findings" label="Findings" icon="critical" order={1}>
          <p>findings</p>
        </Section>
        <Section id="scan" label="Scan" icon="target" order={0}>
          <p>scan</p>
        </Section>
      </>,
    );

    const nav = screen.getByRole("navigation", { name: /page sections/i });
    const items = within(nav).getAllByRole("button");
    // Declared order wins over mount order.
    expect(items.map((b) => b.textContent?.trim())).toEqual(["Scan", "Findings"]);
  });

  it("marks the current section with aria-current so it is not signalled by colour alone", async () => {
    renderChrome(
      [],
      <Section id="scan" label="Scan" icon="target" order={0}>
        <p>scan</p>
      </Section>,
    );

    const nav = screen.getByRole("navigation", { name: /page sections/i });
    const button = within(nav).getByRole("button", { name: /scan/i });

    // The spy resolves on the next animation frame rather than during the
    // effect, so the first active section arrives a tick after mount.
    await waitFor(() => expect(button.getAttribute("aria-current")).toBe("location"));
  });

  it("renders nothing at all when no section has registered", () => {
    renderChrome([]);
    expect(screen.queryByRole("navigation", { name: /page sections/i })).toBeNull();
  });
});

describe("section headings", () => {
  it("contributes a real h2 so the document outline is navigable", () => {
    renderChrome(
      [],
      <Section id="findings" label="Findings" icon="critical" order={0} count={3}>
        <p>body</p>
      </Section>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: /findings/i });
    expect(heading).toBeTruthy();
    // The section is labelled by its own heading, making it a named landmark.
    const section = document.getElementById("findings");
    expect(section?.getAttribute("aria-labelledby")).toBe("findings-heading");
    expect(heading.id).toBe("findings-heading");
  });
});

describe("theme toggle", () => {
  it("switches the document theme and remembers the choice", () => {
    render(<ThemeToggle />);

    // matchMedia reports "not light", so the starting point is dark.
    const button = screen.getByRole("button", { name: /switch to light theme/i });
    fireEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("vibe-fixer-theme")).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeTruthy();
  });
});
