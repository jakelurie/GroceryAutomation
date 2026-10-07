import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { shop as realShop, requireSignedIn } from '../src/shopper.js';

const prefs = { zip:'90210', people:1, days:7, quality:'balanced' };
const rank = async items => items.map(i => ({id:i.id, reason:'Fixture selection', choices:i.candidates.filter(c => c.title.toLowerCase().includes(i.name.toLowerCase()) || (i.name.includes('/') && c.title.includes('Beef'))).map(c => ({...c,quantity:i.quantity,reason:'Fixture quantity'}))}));
const shop = (run, save, cancel, browser) => realShop(Object.assign(run,{preferences:prefs}),save,cancel,browser,rank);

test('cart worker handles confirmed additions, mismatches, and unsigned sessions', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    let clicks = 0;
    await ctx.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/s') return route.fulfill({ contentType:'text/html', body:'<div id="glow-ingress-block">Deliver to 90210</div><div id="nav-link-accountList">Hello, Jake</div><div data-component-type="s-search-result" data-asin="B000123456"><a href="/dp/B000123456"><h2>Organic Oat Milk</h2></a></div>' });
      if (url.pathname === '/dp/B000123456') return route.fulfill({contentType:'text/html', body:'<div id="glow-ingress-block">90210</div><span id="productTitle">Organic Oat Milk</span><select id="quantity"><option>1</option><option>2</option></select><button id="add-to-cart-button" onclick="location.href=\'/confirmed\'">Add to Cart</button>'});
      if (url.pathname === '/confirmed') { clicks++; return route.fulfill({ contentType:'text/html', body:'<h1>Added to cart</h1>' }); }
      return route.abort();
    });
    const run = { store:'grocery', status:'running', items:[{name:'oat milk', quantity:2, status:'pending'}, {name:'eggs', quantity:1, status:'pending'}] };
    const states = [];
    await shop(run, () => states.push(run.items[0].status), () => false, async () => ctx);
    assert.equal(run.status,'complete'); assert.equal(run.items[0].status,'added'); assert.equal(run.items[1].status,'failed'); assert.equal(clicks,1); assert.ok(states.includes('unconfirmed'));
    await ctx.close();
    const unsigned = await browser.newContext();
    await unsigned.route('**/*', route => route.fulfill({contentType:'text/html',body:'<div id="nav-link-accountList">Hello, sign in</div>'}));
    const run2 = {store:'grocery',items:[{name:'milk',quantity:1,status:'pending'}, {name:'eggs',quantity:1,status:'pending'}]};
    await shop(run2, () => {}, () => false, async () => unsigned);
    assert.equal(run2.items[0].status,'failed'); assert.match(run2.items[0].message,/sign.*in/i);
    assert.equal(run2.status, 'failed');
    assert.equal(run2.items[1].status, 'skipped');
    assert.match(run2.error, /signed out/);
    await unsigned.close();
    const uncertain = await browser.newContext();
    let attempts = 0;
    await uncertain.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/s') return route.fulfill({ contentType:'text/html', body:'<div id="glow-ingress-block">Deliver to 90210</div><div id="nav-link-accountList">Hello, Jake</div><div data-component-type="s-search-result" data-asin="B000123456"><a href="/dp/B000123456"><h2>Oat Milk</h2></a></div>' });
      if (url.pathname === '/dp/B000123456') return route.fulfill({contentType:'text/html', body:'<div id="glow-ingress-block">90210</div><span id="productTitle">Oat Milk</span><button id="add-to-cart-button" onclick="location.href=\'/unknown\'">Add to Cart</button>'});
      attempts++; return route.fulfill({contentType:'text/html',body:'<p>Something went wrong.</p>'});
    });
    const run3 = {store:'grocery',items:[{name:'oat milk',quantity:1,status:'pending'}]};
    await shop(run3, () => {}, () => false, async () => uncertain);
    assert.equal(run3.items[0].status,'unconfirmed'); assert.equal(attempts,1);
    const stopped = {store:'grocery',items:[{name:'oat milk',quantity:1,status:'pending'}]};
    await shop(stopped, () => {}, () => true, async () => uncertain);
    assert.equal(stopped.status,'stopped'); assert.equal(stopped.items[0].status,'skipped'); assert.equal(attempts,1);
    await uncertain.close();
  } finally { await browser.close(); }
});


test('account greeting waits for hydration and ignores sign-in links elsewhere in the menu', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="nav-link-accountList"><span id="nav-link-accountList-nav-line-1"></span><span>Sign in to another account</span></div>
      <script>setTimeout(() => document.querySelector('#nav-link-accountList-nav-line-1').textContent = 'Hello, Jake', 150)</script>`);
    await requireSignedIn(page);
    await page.setContent('<div id="nav-link-accountList">Account &amp; Lists</div>');
    await assert.rejects(requireSignedIn(page), /unsupported Amazon layout/);
  } finally { await browser.close(); }
});

test('tries alternatives without adding both products', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const searches = [];
    let additions = 0;
    await ctx.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/s') {
        searches.push(url.searchParams.get('k'));
        const title = searches.length === 1 ? 'Chicken' : 'Beef Burger Patties';
        return route.fulfill({contentType:'text/html',body:`<div id="glow-ingress-block">Deliver to 90210</div><div id="nav-link-accountList">Hello, Jake</div><div data-component-type="s-search-result" data-asin="${searches.length === 1 ? 'B000123455' : 'B000123456'}"><a href="/dp/B000123456"><h2>${title}</h2></a></div>`});
      }
      if (url.pathname === '/dp/B000123456') return route.fulfill({contentType:'text/html',body:`<div id="glow-ingress-block">90210</div><span id="productTitle">Beef Burger Patties</span><button id="add-to-cart-button" onclick="location.href='/confirmed'">Add to Cart</button>`});
      additions++;
      return route.fulfill({contentType:'text/html',body:'Added to cart'});
    });
    const run = {store:'grocery',items:[{name:'Ground beef / beef burger patties',quantity:1,status:'pending'}]};
    await shop(run, () => {}, () => false, async () => ctx);
    assert.deepEqual(searches, ['Ground beef', 'beef burger patties']);
    assert.equal(run.items[0].status, 'added');
    assert.equal(additions, 1);
  } finally { await browser.close(); }
});
