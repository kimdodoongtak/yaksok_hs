import type { BrowserContext } from "@playwright/test";

// Domain-flow regressions start with a returning user. First-visit, dismissal,
// persistence and replay remain covered by availability-coachmarks.spec.ts.
export async function returningCalendarUser(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem("yaksok:availability-guide:v1", "seen");
  });
}
