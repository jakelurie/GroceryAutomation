import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyProduct, collectCandidates } from '../src/shopper.js';

test('grocery headings load asynchronously; identity and package changes stay protected', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => r.fulfill({contentType:'text/html',body:'<main id="main"></main>'}));
    await page.goto('https://www.amazon.com/dp/B000000001');
    const choice = {asin:'B000000001',title:'Wild Salmon, 1 Lb'};
    await page.evaluate(() => setTimeout(() => { document.querySelector('main').innerHTML = '<h1>Wild Salmon — 1 Lb</h1>'; }, 2200));
    assert.equal(await verifyProduct(page,choice,'wild salmon'), 'Wild Salmon — 1 Lb');
    await assert.rejects(verifyProduct(page,{...choice,title:'Wild Salmon 2 lb'},'wild salmon'),/differs/);
    await assert.rejects(verifyProduct(page,{...choice,asin:'B000000002'},'wild salmon'),/different product/);
    await page.setContent('<h2>Recommended products</h2>');
    await assert.rejects(verifyProduct(page,choice,'salmon',30),/heading did not load/);
    await page.setContent('<div data-component-type="s-search-result" data-asin="B000000001"><a href="/Fresh/dp/B000000001?almBrandId=Fresh"><h2>Wild Salmon 1 lb</h2></a></div>');
    assert.equal((await collectCandidates(page,'salmon'))[0].url,'https://www.amazon.com/Fresh/dp/B000000001?almBrandId=Fresh');
  } finally { await browser.close(); }
});
