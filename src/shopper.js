import { chromium } from 'playwright';
import { isPurchaseUrl, searchTerms } from './planner.js';
import path from 'node:path';
import { rankItems, suitable } from './selector.js';

export const stores = {
  grocery: { name: 'Amazon Grocery', home: 'https://www.amazon.com/fmc/ssd-storefront', search: 'https://www.amazon.com/s?i=grocery&k=' },
  fresh: { name: 'Amazon Fresh', home: 'https://www.amazon.com/amazonfresh', search: 'https://www.amazon.com/s?i=amazonfresh&k=' }
};
let context, opening;
export async function browser() {
  if (context) return context;
  if (opening) return opening;
  opening = (async () => {
    const ctx = await chromium.launchPersistentContext(path.resolve('.local/browser'), { headless: false, viewport: { width: 1280, height: 850 }, serviceWorkers: 'block' });
    await ctx.route('**/*', route => {
      let blocked = true;
      try { blocked = isPurchaseUrl(route.request().url()); } catch {}
      return blocked ? route.abort('blockedbyclient') : route.continue();
    });
    ctx.on('close', () => { context = undefined; });
    context = ctx;
    return ctx;
  })();
  try { return await opening; } finally { opening = undefined; }
}
export async function connect(store) {
  const ctx = await browser();
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(stores[store].home, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.bringToFront();
}
async function needsAttention(page) {
  if (/\/ap\/signin|\/ap\/cvf|captcha/i.test(page.url())) return true;
  return await page.getByText(/enter the characters you see|verify that you're not a robot|sign in to shop/i).first().isVisible().catch(() => false);
}

class SessionError extends Error {}
export async function requireSignedIn(page) {
  if (await needsAttention(page)) throw new SessionError('Amazon needs sign-in or verification. Use Open shopping browser on your laptop, complete Amazon setup there, then retry your list.');
  // Wait for the header to hydrate. Inspect only the greeting, not the entire
  // account menu, which can contain a sign-in link even for a signed-in user.
  const readGreeting = () => {
    const line = document.querySelector('#nav-link-accountList-nav-line-1, #nav-link-accountList .nav-line-1, #nav-link-accountList .nav-line-1-container');
    const account = document.querySelector('#nav-link-accountList');
    return (line ? line.textContent : account?.innerText?.split('\n')[0] || '').trim();
  };
  await page.waitForFunction(readGreeting, undefined, { timeout: 10000 }).catch(() => {});
  const greeting = await page.evaluate(readGreeting);
  if (/^(?:hello[,!]?\s*)?sign\s*in\b/i.test(greeting)) throw new SessionError('Amazon shows you are signed out in the shopping browser. Use Open shopping browser on your laptop and sign in there, then retry your list.');
  if (!/^hello[,!]\s*\S/i.test(greeting)) throw new SessionError('Could not verify the Amazon account on this page. Open the shopping browser, check sign-in and delivery location, then retry. This may be an unsupported Amazon layout.');
}

export async function verifyLocation(page, zip) {
  const header = page.locator('#glow-ingress-block, #nav-global-location-popover-link').first();
  const text = await header.innerText().catch(() => '');
  if (!new RegExp(`\\b${zip}\\b`).test(text)) throw new SessionError(`Amazon's delivery location does not show ${zip}. Open the shopping browser and select your delivery address for this ZIP, then retry. No availability was assumed.`);
}

export async function setLocation(page, zip) {
  try { await verifyLocation(page, zip); return; } catch {}
  try {
    await page.locator('#nav-global-location-popover-link, #glow-ingress-block').first().click();
    await page.locator('#GLUXZipUpdateInput').fill(zip);
    await page.locator('#GLUXZipUpdate input, #GLUXZipUpdate button, #GLUXZipUpdate').first().click();
    const done = page.getByRole('button', { name: /^(done|continue)$/i }).first();
    if (await done.isVisible()) await done.click();
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch {}
  await verifyLocation(page, zip);
}

export async function collectCandidates(page, name) {
  const cards = page.locator('[data-component-type="s-search-result"][data-asin]');
  await cards.first().waitFor({ timeout: 12000 }).catch(() => {});
  const products = await cards.evaluateAll(nodes => nodes.slice(0,24).map(card => ({
    asin: card.getAttribute('data-asin'),
    href: card.querySelector('a:has(h2), h2 a, a.a-link-normal.s-no-outline')?.getAttribute('href'),
    title: card.querySelector('h2')?.textContent?.trim() || '',
    details: (card.innerText || '').slice(0,1600),
    price: card.querySelector('.a-price .a-offscreen')?.textContent?.trim() || null,
  })));
  return products.filter(p => /^[A-Z0-9]{10}$/.test(p.asin) && p.title && suitable(name,p.title) && !/currently unavailable|out of stock/i.test(p.details))
    .map(p => {
      // Keep storefront and delivery context from the actual search-result link.
      let url = new URL(`/dp/${p.asin}`, 'https://www.amazon.com');
      try {
        const link = new URL(p.href, 'https://www.amazon.com');
        if (link.protocol === 'https:' && link.hostname === 'www.amazon.com' &&
            link.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/)?.[1] === p.asin && !isPurchaseUrl(link.href)) url = link;
      } catch {}
      const { href, ...product } = p;
      return { ...product, url: url.href };
    });
}

export async function verifyProduct(page, choice, query, timeout = 12000) {
  const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[®™]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // Fresh and grocery pages may use a heading rather than the retail productTitle ID.
  const titles = page.locator('#productTitle, #title h1, h1, [data-a-feature-name="title"]');
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('#productTitle, #title h1, h1, [data-a-feature-name="title"]')].some(el => el.getClientRects().length && el.textContent.trim()), undefined, { timeout });
  } catch {}
  const visible = await titles.evaluateAll(nodes => nodes.filter(el => el.getClientRects().length).map(el => el.textContent.trim()).filter(Boolean));
  if (!visible.length) throw new Error('Product heading did not load in a supported layout; this does not establish that the item is sold out.');
  const asin = new URL(page.url()).pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/)?.[1];
  if (asin !== choice.asin) throw new Error('Amazon redirected to a different product; skipped.');
  const title = visible.find(text => normalize(text) === normalize(choice.title));
  if (!title) throw new Error('Product heading differs from the search result; skipped to avoid a changed size or variant.');
  if (!suitable(query, title)) throw new Error('Product food form or requested qualifier conflicts with your list.');
  return title;
}

export async function shop(run, save, cancelled, getBrowser = browser, rank = rankItems) {
  let page;
  const controller = new AbortController();
  const poll = setInterval(() => { if (cancelled()) controller.abort(); }, 250);
  try {
    const ctx = await getBrowser();
    page = await ctx.newPage(); page.setDefaultTimeout(8000);
    run.phase = 'Checking delivery location'; save();
    // Each search is loaded separately, then compact product data is batched for AI.
    let locationSet = false;
    for (const [id,item] of run.items.entries()) {
      if (cancelled()) break;
      item.id = id; item.status = 'searching'; item.candidates = [];
      run.phase = `Collecting search results: ${id + 1} of ${run.items.length}`; save();
      try {
        for (const term of searchTerms(item.name)) {
          if (cancelled()) break;
          await page.goto(stores[run.store].search + encodeURIComponent(term), { waitUntil: 'domcontentloaded', timeout: 45000 });
          await requireSignedIn(page);
          if (!locationSet) { await setLocation(page, run.preferences.zip); locationSet = true; }
          await verifyLocation(page, run.preferences.zip);
          for (const candidate of await collectCandidates(page, item.name)) {
            if (!item.candidates.some(p => p.asin === candidate.asin) && item.candidates.length < 24) item.candidates.push(candidate);
          }
        }
        item.status = item.candidates.length ? 'collected' : 'failed';
        item.message = item.candidates.length ? `${item.candidates.length} candidates collected for comparison.` : 'No supported, available product candidates found for this location.';
      } catch (error) {
        if (error instanceof SessionError || page.isClosed()) { item.status = 'failed'; item.message = error.message.split('\n')[0]; throw error; }
        item.status = 'failed'; item.message = error.message.split('\n')[0];
      }
      save();
    }
    if (cancelled()) return;
    const collected = run.items.filter(i => i.status === 'collected');
    run.phase = 'AI comparing food matches, package sizes, quality and value'; save();
    const decisions = await rank(collected, run.preferences, controller.signal, undefined, progress => { run.aiProgress = progress; save(); });
    for (const decision of decisions) {
      const item = run.items[decision.id];
      item.choices = decision.choices; item.message = decision.reason;
      item.status = decision.choices.length ? 'ranked' : 'failed';
    }
    save();
    for (const item of run.items.filter(i => i.status === 'ranked')) {
      if (cancelled()) break;
      run.phase = `Checking and adding ${item.name}`;
      item.attempts = []; save();
      for (const choice of item.choices) {
        if (cancelled()) break;
        try {
          await page.goto(choice.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          if (await needsAttention(page)) throw new SessionError('Amazon needs sign-in or verification. Complete it in the shopping browser.');
          await verifyLocation(page, run.preferences.zip);
          const title = await verifyProduct(page, choice, item.name);
          const availability = await page.locator('#availability, #deliveryBlockMessage').allTextContents();
          if (/currently unavailable|out of stock|cannot be (?:shipped|delivered)|not available/i.test(availability.join(' '))) throw new Error('Unavailable for your delivery location.');
          const add = page.locator('#add-to-cart-button');
          if (!await add.isVisible() || !await add.isEnabled()) throw new Error('No supported available Add to Cart option.');
          const quantity = page.locator('select#quantity');
          if (await quantity.count()) await quantity.selectOption(String(choice.quantity));
          else if (choice.quantity !== 1) throw new Error('Requested package count is not available.');
          if (cancelled()) break;
          item.product = { title, url: choice.url }; item.quantity = choice.quantity;
          item.price = await page.locator('#corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen').first().textContent({timeout:1000}).catch(() => choice.price); item.selectionReason = choice.reason;
          // Never try a fallback after an add has started, even if confirmation fails.
          item.status = 'unconfirmed'; item.message = 'Addition started; check Amazon before retrying.'; save();
          await add.click({ timeout: 10000, noWaitAfter: true });
          await page.getByText(/added to (?:your )?cart/i).first().waitFor({ state: 'visible', timeout: 15000 });
          item.status = 'added'; item.message = 'Amazon confirmed the addition.'; save(); break;
        } catch (error) {
          if (item.status === 'unconfirmed') { item.message = 'No confirmation received. Check Amazon before retrying; no backup was attempted.'; save(); break; }
          if (error instanceof SessionError || page.isClosed()) throw error;
          item.attempts.push({ title: choice.title, reason: error.message.split('\n')[0] }); save();
        }
      }
      if (item.status === 'ranked' && !cancelled()) { item.status = 'failed'; item.message = 'None of the ranked choices could be added. See attempted choices.'; }
      save();
    }
    run.status = cancelled() ? 'stopped' : 'complete';
  } catch (error) { run.status = cancelled() ? 'stopped' : 'failed'; if (!cancelled()) run.error = error.message.split('\n')[0]; }
  finally {
    clearInterval(poll);
    if (cancelled()) run.status = 'stopped';
    for (const item of run.items) if (['pending', 'searching', 'collected', 'ranked'].includes(item.status)) { item.status = 'skipped'; item.message = 'Not added: run stopped or needs attention.'; }
    run.phase = run.status; run.finishedAt = new Date().toISOString(); save();
    if (page) await page.close().catch(() => {});
  }
}
