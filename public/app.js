const $ = id => document.getElementById(id);
let csrf, items = [], active, previous = '', busy = false;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const notify = message => { $('notice').hidden = false; $('notice').textContent = message; };
async function api(path, body) {
  const response = await fetch('/api/' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type':'application/json', 'X-CSRF-Token':csrf }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
async function action(button, fn) {
  button.disabled = true;
  try { await fn(); } catch (error) { notify(error.message); }
  finally { button.disabled = false; await refresh(); }
}
for (const id of ['groceries','people','days','store','zip','quality']) {
  const value = localStorage.getItem(id); if (value !== null) $(id).value = value;
  $(id).addEventListener('input', () => { localStorage.setItem(id, $(id).value); $('review-panel').hidden = true; items = []; });
}
$('example').onclick = () => { $('groceries').value = 'Bananas\nEggs\nOat milk\nSourdough bread\nAvocados'; $('groceries').dispatchEvent(new Event('input')); };
$('review').onclick = () => action($('review'), async () => {
  const data = await api('plan', { text:$('groceries').value, people:Number($('people').value), days:Number($('days').value) });
  items = data.items; renderPlan(); $('review-panel').hidden = false; $('review-panel').scrollIntoView({ behavior:'smooth', block:'start' });
});
function renderPlan() {
  $('plan').innerHTML = items.map((item, i) => `<div class="plan-row"><label for="qty-${i}">${escape(item.name)} <small class="subtle">· packages</small></label><input id="qty-${i}" type="number" min="1" max="20" placeholder="AI" value="${item.explicit ? item.quantity : ''}" data-index="${i}"><button data-remove="${i}" aria-label="Remove ${escape(item.name)}">×</button></div>`).join('');
  $('start').disabled = !items.length || Boolean(active);
}
$('plan').oninput = event => { if (event.target.dataset.index !== undefined) { const item = items[Number(event.target.dataset.index)]; item.explicit = event.target.value !== ''; item.quantity = item.explicit ? Number(event.target.value) : 1; } };
$('plan').onclick = event => { if (event.target.dataset.remove !== undefined) { items.splice(Number(event.target.dataset.remove), 1); renderPlan(); } };
$('connect').onclick = () => action($('connect'), async () => { busy = true; try { notify('Opening the Amazon shopping browser on your laptop…'); const data = await api('connect', { store:$('store').value }); notify(data.message); } finally { busy = false; } });
$('start').onclick = () => action($('start'), async () => { await api('runs', { items, store:$('store').value, preferences:{zip:$('zip').value, quality:$('quality').value, people:Number($('people').value), days:Number($('days').value)} }); $('review-panel').hidden = true; notify('Shopping started. You can follow each item below. Checkout stays with you.'); });
$('stop').onclick = () => action($('stop'), async () => notify((await api('stop', {})).message));
async function refresh() {
  try {
    const state = await api('state'); csrf = state.csrf; active = state.active;
    $('connect').disabled = Boolean(active || state.connecting || busy); $('start').disabled = Boolean(active) || !items.length;
    $('stop').hidden = !active;
    const serial = JSON.stringify(state.runs); if (serial === previous) return; previous = serial;
    if (!state.runs.length) return;
    $('runs').innerHTML = state.runs.map(run => {
      const added = run.items.filter(i => i.status === 'added').length;
      return `<article class="card run"><div class="run-head"><div><h2>${added} of ${run.items.length} groceries added</h2><p>${run.store === 'fresh' ? 'Amazon Fresh' : 'Amazon Grocery'} · ${escape(new Date(run.createdAt).toLocaleString())}</p></div><span class="badge ${escape(run.status)}">${escape(run.status)}</span></div><p>${escape(run.phase || '')}${run.preferences ? ' · ZIP ' + escape(run.preferences.zip) + ' · ' + escape(run.preferences.quality) : ''}</p>${run.error ? `<p class="error">${escape(run.error)}</p>` : ''}${run.items.map(item => `<div class="result-row"><div class="result-info"><strong>${escape(item.name)} × ${item.quantity}</strong>${item.product ? `<p><a href="${escape(item.product.url)}" target="_blank" rel="noopener noreferrer">${escape(item.product.title)}</a>${item.price ? ' · ' + escape(item.price) : ''}</p>` : ''}${item.selectionReason ? `<p><strong>Why this choice:</strong> ${escape(item.selectionReason)}</p>` : ''}${(item.attempts || []).map(a => `<p>Skipped ${escape(a.title)}: ${escape(a.reason)}</p>`).join('')}<p>${escape(item.message || (item.status === 'searching' ? 'Looking for a match…' : 'Waiting to search'))}</p></div><span class="badge ${escape(item.status)}">${escape(item.status)}</span></div>`).join('')}<div class="run-footer"><a class="cart-link" href="https://www.amazon.com/gp/cart/view.html" target="_blank" rel="noopener noreferrer">Review your Amazon cart ↗</a><button class="secondary download" data-download="${run.id}">Save report ↓</button></div></article>`;
    }).join('');
    document.querySelectorAll('[data-download]').forEach(button => button.onclick = () => { const run = state.runs.find(r => r.id === button.dataset.download); const blob = new Blob([JSON.stringify(run,null,2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'grocery-report-' + run.createdAt.slice(0,10) + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  } catch (error) { notify('Could not reach the app. Keep the laptop awake and refresh to reconnect.'); }
}
await refresh(); setInterval(refresh, 2000);
