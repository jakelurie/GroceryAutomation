import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, isPurchaseUrl, matchesProduct } from '../src/planner.js';

test('defaults, explicit quantities, merged duplicates and household scaling', () => {
  assert.equal(plan('milk')[0].quantity, 1);
  assert.deepEqual(plan('2 x eggs\neggs', 2, 7).map(i => [i.name,i.quantity]), [['eggs',4]]);
  assert.equal(plan('rice', 1, 3)[0].quantity, 1);
  assert.equal(plan('rice', 10, 30)[0].quantity, 6);
  assert.equal(plan('2 x rice', 10, 30)[0].quantity, 2);
});
test('rejects invalid and excessive inputs', () => {
  for (const input of ['', '0 x milk', '21 x rice', Array(61).fill('rice').join('\n'), '15 x milk\n10 x milk']) assert.throws(() => plan(input));
  assert.throws(() => plan('milk', -1, 7));
  assert.throws(() => plan('milk', 1, NaN));
});
test('purchase routes blocked and cart routes allowed', () => {
  for (const path of ['/gp/buy/spc','/checkout','/buy-now','/place-order','/gp/aw/ya','/ordering/submit','/one-click','/%63heckout']) assert.ok(isPurchaseUrl('https://www.amazon.com'+path));
  for (const path of ['/gp/cart/view.html','/gp/add-to-cart/json','/s?k=milk','/dp/B000123456']) assert.equal(isPurchaseUrl('https://www.amazon.com'+path),false);
});
test('every grocery keyword must match, including dietary qualifiers', () => {
  assert.ok(matchesProduct('organic bananas', 'Organic Banana Bunch'));
  assert.ok(!matchesProduct('unsweetened oat milk', 'Sweetened Oat Milk'));
  assert.ok(!matchesProduct('milk', 'Milkweed seeds'));
});

test('grocery alternatives preserve nouns and qualifiers', () => {
  for (const [query, title] of [
    ['Ground beef / beef burger patties', 'Beef Burger Patties'],
    ['White or red onions', 'White Onions'],
    ['White or red onions', 'Red Onions'],
    ['Lettuce / lettuce wraps', 'Romaine Lettuce'],
    ['Water / alkaline water', 'Spring Water'],
    ['Bread/toast', 'Sourdough Bread'],
  ]) assert.ok(matchesProduct(query, title), query);
  assert.equal(matchesProduct('White or red onions', 'White Bread'), false);
  assert.equal(matchesProduct('Wild salmon', 'Farmed Salmon'), false);
});


test('login parameters and tokens do not trigger purchase blocking', () => {
  for (const suffix of [
    '/ap/signin?openid.return_to=https%3A%2F%2Fwww.amazon.com%2Fgp%2Fbuy%2Fspc',
    '/ap/signin?token=checkout&openid.assoc_handle=amazon_checkout_us',
    '/ap/cvf?return_to=%2Fcheckout&token=%broken',
    '/s?k=one-click',
  ]) assert.equal(isPurchaseUrl('https://www.amazon.com' + suffix), false);
  assert.equal(isPurchaseUrl('https://www.amazon.com/gp/buy/spc?from=signin'), true);
});
