# Pantry Pilot

A local grocery-list app that uses a dedicated visible Playwright browser to add matching Amazon groceries to a cart. Checkout remains manual.

## Run

Requires Node 20 or newer. Run `npm ci`, `npx playwright install chromium`, and `npm start`. Open http://127.0.0.1:4320. `PORT` can override the port. The registered app uses its assigned port (currently 4306). Run `npm test` for planner, purchase-route, and simulated browser-worker tests.

1. Choose Amazon Grocery or Amazon Fresh and click **Open shopping browser** on your laptop.
2. Sign in directly to Amazon and set your delivery location. Resolve any verification there. Do not share your password with the app.
3. Enter groceries, review package counts, and click **Add this list to my cart**.
4. Review confirmed, failed, unconfirmed, and skipped items. Open Amazon on your own browser with the same account to review package sizes, prices, availability, and checkout. Fresh may have a separate cart accessible from its storefront.

Enter a five-digit US delivery ZIP, people, days and quality (value, balanced or premium). The worker attempts to set Amazon's delivery ZIP, then verifies the displayed ZIP on every search and product page. If Amazon requires a saved address, select it in the shopping browser. This checks shopping location, not guaranteed delivery slots or inventory.

All search pages are visited before selection. The worker extracts up to 24 product cards per grocery (title, ASIN, price, and visible details including sizes/ratings when present). It sends compact product data, not full HTML or account details, to the installed Claude CLI in batches of at most eight items / approximately 45,000 characters. Each batch includes the whole list for portion allocation. Claude runs with tools, MCP, customizations and session persistence disabled. Requires a working `claude` login; `PANTRY_CLAUDE_BIN` can set the executable. AI usage uses that account's limits. If AI fails or returns invalid selections, nothing is added; there is no silent first-result fallback.

AI ranks up to three suitable choices per grocery, considering food form, stated quality, comparable unit prices, package sizes, people and days. Plain salmon excludes salmon burgers; requested dietary qualifiers are retained. It estimates quantities across the basket. Unknown sizes default to one package. These are approximate shopping assumptions, not a meal plan. Explicit counts (`2 x eggs`) or edited count fields fix package counts; blank count fields use AI. Reasons are saved in reports. Always review sizes, quantities, prices and ingredients in Amazon.

Candidates are checked on their product page before adding. An unavailable or unsupported first choice can fall back to a ranked equivalent, with the reason recorded. After any add click starts, no fallback is attempted, even without confirmation. Product page titles must agree with collected titles; changed variants are skipped. Search coverage is limited to supported Amazon layouts and the first 24 cards per query, not a claim to find every deal.

## Safety and limitations

- The worker only clicks `#add-to-cart-button`; it never clicks checkout or purchase buttons. The dedicated browser blocks known checkout, ordering, buy-now and one-click routes at the network layer, including while you interact with it. Complete checkout in your regular browser.
- An addition is recorded as confirmed only after an Amazon confirmation is visible. Clicks without confirmation are **unconfirmed**, are never automatically retried, and need manual cart inspection. Restarting the server never resumes a run.
- Account checks wait for the greeting to load and inspect the greeting separately from menu links. A sign-in challenge, unrecognized account header, or closed browser stops the run with a run-level explanation; remaining groceries are skipped.
- Amazon layouts and availability vary. Unsupported pages, quantities, login challenges, and ambiguous matches are reported rather than bypassed. Live additions require testing with your signed-in account; automated tests use simulated Amazon pages.
- No cart clearing or removal occurs. Existing cart contents remain; added quantities may increase quantities already present.
- Stop prevents subsequent items; an in-flight action may finish.
- `.local/browser` holds your dedicated browser session and `.local/runs.json` holds reports. Both are ignored by Git. Do not share this directory. The server binds only to loopback and rejects mutation requests without its per-process CSRF token.
- The phone route uses private Tailscale access. Anyone with access to this app through your tailnet can operate your shopping browser; restrict access to your own devices. The laptop must be awake and the server running. No public hosting is configured.

The UI keeps your draft in the current browser's local storage. Reports persist on the laptop and can be downloaded as JSON.

References: [Playwright persistent browsers](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [Amazon grocery shopping](https://www.aboutamazon.com/news/retail/how-to-order-groceries-amazon).
