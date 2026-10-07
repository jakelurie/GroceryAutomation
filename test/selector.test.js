import test from 'node:test';
import assert from 'node:assert/strict';
import { preferences, suitable, validateDecisions, rankItems } from '../src/selector.js';
import { chromium } from 'playwright';
import { shop } from '../src/shopper.js';
const prefs = { zip:'90210', people:1, days:7, quality:'balanced' };
const candidate = {asin:'B000000001',title:'Wild Salmon Fillet 1 lb',url:'https://www.amazon.com/dp/B000000001'};
test('validates preferences and rejects food form conflicts', () => {
  assert.deepEqual(preferences(prefs),prefs);
  assert.throws(() => preferences({...prefs,zip:'9021'}));
  assert.throws(() => preferences({...prefs,days:0}));
  assert.equal(suitable('salmon','Salmon Burgers'),false);
  assert.equal(suitable('salmon','Wild Salmon Fillet'),true);
  assert.equal(suitable('wild salmon','Farmed Salmon'),false);
  assert.equal(suitable('salmon burgers','Salmon Burgers'),true);
});
test('AI output cannot invent products, duplicate items, or override explicit counts', () => {
  const items=[{id:0,name:'salmon',explicit:true,quantity:2,candidates:[candidate]}];
  const good={decisions:[{id:0,reason:'Match',choices:[{asin:candidate.asin,quantity:2,reason:'Two packages'}]}]};
  assert.equal(validateDecisions(good,items)[0].choices[0].quantity,2);
  for (const change of [{asin:'invented',quantity:2},{asin:candidate.asin,quantity:1},{asin:candidate.asin,quantity:30}]) assert.throws(()=>validateDecisions({decisions:[{id:0,reason:'x',choices:[{...change,reason:'x'}]}]},items));
  assert.throws(()=>validateDecisions({decisions:[]},items));
});
test('AI batches keep whole basket context and honor cancellation', async () => {
  const items=Array.from({length:10},(_,id)=>({id,name:'salmon',candidates:[candidate]}));
  let calls=0;
  const result=await rankItems(items,prefs,undefined,async payload=>{calls++;assert.equal(payload.wholeList.length,10);return {decisions:payload.items.map(i=>({id:i.id,reason:'skip',choices:[]}))};});
  assert.equal(calls,2);assert.equal(result.length,10);
  const controller=new AbortController();controller.abort();
  await assert.rejects(rankItems(items,prefs,controller.signal,()=>assert.fail('called despite cancellation')));
});
test('collects all searches before ranking; sold-out first choice uses backup; location mismatch stops', async () => {
 const browser=await chromium.launch();
 try {
  const ctx=await browser.newContext();let clicks=0;const searches=[];
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   const header='<div id="glow-ingress-block">90210</div><div id="nav-link-accountList">Hello, Jake</div>';
   if(u.pathname==='/s') {searches.push(u.searchParams.get('k'));return route.fulfill({contentType:'text/html',body:header+[1,2].map(n=>`<div data-component-type="s-search-result" data-asin="B00000000${n}"><h2>Salmon Fillet ${n} lb</h2><span>$12</span></div>`).join('')});}
   if(u.pathname.startsWith('/dp/')) {const n=u.pathname.endsWith('1')?1:2;return route.fulfill({contentType:'text/html',body:header+`<span id="productTitle">Salmon Fillet ${n} lb</span>`+(n===1?'<div id="availability">Currently unavailable</div>':`<button id="add-to-cart-button" onclick="location.href='/confirmed'">Add to Cart</button>`)});}
   clicks++;return route.fulfill({contentType:'text/html',body:'Added to cart'});
  });
  const run={store:'grocery',preferences:prefs,items:[{name:'salmon',quantity:1,status:'pending'},{name:'wild salmon',quantity:1,status:'pending'}]};
  await shop(run,()=>{},()=>false,async()=>ctx,async items=>{assert.equal(searches.length,2);assert.equal(clicks,0);return items.map(i=>({id:i.id,reason:'ranked',choices:i.candidates.map(c=>({...c,quantity:1,reason:'One package'}))}));});
  assert.equal(run.items[0].status,'added');assert.equal(run.items[0].attempts.length,1);assert.equal(clicks,1);
  await ctx.close();
  const wrong=await browser.newContext();await wrong.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="nav-link-accountList">Hello, Jake</div><div id="glow-ingress-block">10001</div>'}));
  const bad={store:'grocery',preferences:prefs,items:[{name:'salmon',quantity:1,status:'pending'}]};
  await shop(bad,()=>{},()=>false,async()=>wrong,()=>assert.fail('AI should not run for wrong location'));
  assert.equal(bad.status,'failed');assert.match(bad.error,/90210/);
 } finally {await browser.close();}
});
