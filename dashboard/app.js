// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, its filters, a per-protocol detail drawer and the model itself.
// No network: every byte it shows is in data.js, and every farm plan it prints is the exact
// string board.json carries for that row, shipped inside the same dataset.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', segment: 'all', min: 0, sort: 'implied', dir: -1, selected: null };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(2); }
  // The model, recomputed in the page: a row's implied value from its own printed multipliers.
  // main.ts rounds every multiplier to 4 places before use, so this lands on the board's number.
  function impliedOf(row) {
    var m = row.model;
    return Math.max(1, Math.round(row.tvl_usd * m.category_multiple * m.growth_multiplier * m.maturity_multiplier * m.breadth_multiplier));
  }
  function catStat(category) {
    var key = category || 'Uncategorised';
    for (var i = 0; i < DATA.categories.length; i++) if (DATA.categories[i].category === key) return DATA.categories[i];
    return null;
  }
  function percentileOf(value, pick) {
    var below = 0;
    DATA.rows.forEach(function (r) { if (pick(r) < value) below++; });
    return Math.round((below / DATA.rows.length) * 100);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('segment')) state.segment = params.get('segment');
    if (params.get('min')) state.min = Number(params.get('min')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.segment !== 'all') params.set('segment', state.segment);
    if (state.min) params.set('min', String(state.min));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.segment === 'watchlist' && !r.watchlist) return false;
      if (state.segment === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.min && r.implied_value_usd < state.min) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.implied_multiple; bv = b.implied_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name' }, 'Launch ', el('em', { text: 'Radar' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.board_size + ' protocols that record no token, ranked by ', el('span', { class: 'hl', text: 'implied value' })),
        el('p', { text: 'Every protocol on the snapshot\'s watchlist is here, plus the early radar below its $' + Math.round(DATA.floor_usd / 1e6) + 'M floor: ' + DATA.early_size + ' more pre-token protocols the same screen admits. Each implied value is priced off the traded market\'s own category multiples, the protocol\'s TVL, its seven-day growth, its years with no token and its chain reach. An implied value is this board\'s model, never a promise, and "records no token" is all the snapshot can say.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board implied total' }), el('b', { text: fmtUsd(DATA.board_implied_total_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; keepFocus = 'q'; writeHash(); render(); });
    function select(id, label, values, current, onchange) {
      var s = el('select', { id: id, 'aria-label': label },
        values.map(function (v) {
          return el('option', { value: v.value, text: v.text, selected: v.value === current ? 'selected' : null });
        }));
      s.addEventListener('change', function () { onchange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var catSel = select('category', 'Category',
      [{ value: 'all', text: 'All categories' }].concat(categories.map(function (c) { return { value: c, text: c }; })),
      state.category, function (v) { state.category = v; });
    var chainSel = select('chain', 'Chain',
      [{ value: 'all', text: 'All chains' }].concat(chains.map(function (c) { return { value: c, text: c }; })),
      state.chain, function (v) { state.chain = v; });
    var minSel = select('min', 'Min implied',
      [{ value: '0', text: 'Any value' }, { value: '1000000', text: '$1M and up' }, { value: '10000000', text: '$10M and up' }, { value: '50000000', text: '$50M and up' }, { value: '100000000', text: '$100M and up' }],
      String(state.min), function (v) { state.min = Number(v) || 0; });
    function tab(value, label) {
      return el('button', { type: 'button', 'aria-pressed': state.segment === value ? 'true' : 'false', text: label, onclick: function () { state.segment = value; writeHash(); render(); } });
    }
    var liveTab = el('button', { type: 'button', 'aria-pressed': state.segment === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.segment = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      catSel, chainSel, minSel,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Board' }),
        el('div', { class: 'tabs' }, tab('all', 'All ranked'), tab('watchlist', 'Watchlist'), tab('early', 'Early radar'), liveTab)),
      el('span', { class: 'count', text: state.segment === 'live' ? DATA.live.length + ' live-token protocols shown' : rows().length + ' of ' + DATA.board_size + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; }
        render();
      } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.min = 0; writeHash(); render();
        } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'no chain named') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.implied_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null,
          r.watchlist ? el('span', { class: 'chip wl', text: 'WATCHLIST' }) : el('span', { class: 'chip', text: 'EARLY' }),
          el('span', { class: 'chip conf', text: 'comps ' + r.model.confidence })
        )
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. "Comps" grades how many traded protocols in the category back its multiple: A is 10 or more, B is 5 to 9, C is 1 to 4, D means the global median stands in. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'rank', text: 'live' }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name + (r.symbol ? ' (' + r.symbol + ')' : '') }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'no chain named') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : fmtMult(r.ratio) }),
        el('td', null, el('span', { class: 'chip live', text: 'ALREADY TRADES' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Set aside, not ranked: these protocols\' tokens already trade, so their market cap is a fact, not a model. Their market-cap-to-TVL ratios are the comparables the pre-token multiples are built from. The ' + DATA.live_size + ' live-token protocols of the snapshot are represented here by the ' + DATA.live.length + ' largest.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Cap / TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var topCats = DATA.categories.slice(0, 10);
    var tbody = el('tbody');
    topCats.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: c.median_ratio === null ? 'none' : fmtMult(c.median_ratio) }),
        el('td', { class: 'num', text: c.p25_ratio === null ? 'n/a' : fmtMult(c.p25_ratio) + ' – ' + fmtMult(c.p75_ratio) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', null, el('span', { class: 'chip conf', text: c.confidence }))
      ));
    });
    return el('div', { class: 'cols' },
      el('section', { class: 'panel' },
        el('h2', { text: 'How an implied value is priced' }),
        el('p', { text: 'The market already prices protocols whose tokens trade: in this snapshot the median traded protocol changes hands at ' + fmtMult(DATA.global_median_ratio) + ' its TVL. The model takes each category\'s own median ratio, shrinks it toward that global median by the number of traded peers behind it (a pseudo-count of ' + m.shrink_k + '), clamps it to ' + fmtMult(m.multiple_floor) + '–' + fmtMult(m.multiple_cap) + ', then adjusts for the protocol itself. No protocol\'s name is ever an input.' }),
        el('div', { class: 'formula', text: 'implied = round( tvl x category_multiple x (1 + clamp(7d%, ' + m.growth_floor_pct + ', ' + m.growth_cap_pct + ') x ' + m.growth_weight + ') x (' + m.maturity_base + ' + min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + ' x ' + m.maturity_span + ') x (1 + ' + m.breadth_step + ' x extra chains) )' }),
        el('p', { text: 'Growth is the TVL change over seven days. Age is the time since DefiLlama first tracked the protocol: the record of how long it has run with no token; an unreported age uses the snapshot\'s median reported age, ' + DATA.unknown_age_days + ' days. Breadth counts the chains it already reaches, capped at ' + m.breadth_steps + ' extra. Every multiplier is rounded to four places before use, so the detail view\'s arithmetic reproduces the board\'s number to the dollar.' })
      ),
      el('section', { class: 'panel' },
        el('h2', { text: 'Category multiples, from the traded market' }),
        el('table', { class: 'mini' },
          el('thead', null, el('tr', null,
            el('th', { text: 'Category' }), el('th', { text: 'Comps' }), el('th', { text: 'Median' }),
            el('th', { text: 'Middle half' }), el('th', { text: 'Used' }), el('th', { text: 'Grade' })
          )),
          tbody
        ),
        el('p', { class: 'note', text: 'The ten board categories with the most traded comparables. A category with no traded peer is priced at the global median and graded D on its rows.' })
      )
    );
  }

  function screenPanel() {
    var s = DATA.screened_out;
    var total = s.versioned + s.exchange + s.wrapped_or_staked + s.cex_category + s.asset_product;
    return el('section', { class: 'panel' },
      el('h2', { text: 'What the radar leaves out, and why' }),
      el('p', { text: 'Of the snapshot\'s pre-token protocols, ' + total + ' are set aside by the same screen that built the watchlist, because a launch of their own is not what their record describes: ' +
        s.asset_product + ' bridges, liquid-staking and restaking products whose TVL is other protocols\' assets (WBTC and USDT0 are the famous ones: wrapped and bridged forms of tokens that already trade); ' +
        s.versioned + ' versioned pools of another protocol; ' + s.wrapped_or_staked + ' named as wrapped or staked products; ' +
        s.exchange + ' products that begin with an exchange\'s name; and ' + s.cex_category + ' exchanges themselves. They are counted here, never ranked: ranking a wrapped asset as a launch candidate would be the one unforgivable error on a launch radar.' }),
      el('p', { text: 'Two honest limits. DefiLlama\'s record is not proof: a protocol here may have a token its record does not carry, so the board says "records no token", never "has none". And the snapshot is one day\'s figures (' + DATA.as_of + '): implied values move with TVL, growth and the traded market\'s multiples, and would be repriced on a fresher fetch.' })
    );
  }

  // render() rebuilds the page, which would drop the caret out of the search box on every
  // keystroke; the box's id is remembered here and focus is restored after each render.
  var keepFocus = null;

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var stat = catStat(row.category);
    var recomputed = impliedOf(row);
    var inner = el('div', { class: 'detail-inner' });
    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'over', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'no chain named') + ' · records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var wf = el('div', { class: 'waterfall' });
    function wrow(label, value, cls) {
      return el('div', { class: 'row' + (cls ? ' ' + cls : '') }, el('span', { text: label }), el('b', { class: 'num', text: value }));
    }
    wf.appendChild(wrow('TVL (snapshot)', fmtUsd(row.tvl_usd)));
    wf.appendChild(wrow('Category multiple: ' + (row.category || 'Uncategorised'), fmtMult(row.model.category_multiple)));
    wf.appendChild(wrow('Growth: ' + fmtPct(row.model.growth_pct) + ' over 7d', fmtMult(row.model.growth_multiplier)));
    wf.appendChild(wrow('Maturity: ' + fmtAge(row.age_days) + ' with no token', fmtMult(row.model.maturity_multiplier)));
    wf.appendChild(wrow('Breadth: ' + (row.chains ? row.chains.length : 0) + (row.chains && row.chains.length === 1 ? ' chain' : ' chains'), fmtMult(row.model.breadth_multiplier)));
    wf.appendChild(wrow('Implied value', fmtUsd(row.implied_value_usd), 'total'));
    inner.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'The model, step by step' }), wf,
      el('p', { class: 'note', text: 'Recomputed in this page from the figures above: ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' — the board\'s number to the dollar.' : ' — which differs from the board, so the data would be stale.') })
    ));
    if (stat) {
      inner.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'The comparables behind the multiple' }),
        el('dl', { class: 'kv' },
          el('dt', { text: 'Traded peers in category' }), el('dd', { class: 'num', text: String(stat.comps) }),
          el('dt', { text: 'Their median cap / TVL' }), el('dd', { class: 'num', text: stat.median_ratio === null ? 'none in the snapshot' : fmtMult(stat.median_ratio) }),
          el('dt', { text: 'Their middle half' }), el('dd', { class: 'num', text: stat.p25_ratio === null ? 'n/a' : fmtMult(stat.p25_ratio) + ' – ' + fmtMult(stat.p75_ratio) }),
          el('dt', { text: 'Confidence grade' }), el('dd', { text: stat.confidence + (stat.confidence === 'D' ? ' (global median stands in)' : '') }),
          el('dt', { text: 'This TVL\'s board percentile' }), el('dd', { class: 'num', text: percentileOf(row.tvl_usd, function (r) { return r.tvl_usd; }) + 'th' }),
          el('dt', { text: 'First tracked by DefiLlama' }), el('dd', { text: row.listed_at || 'not reported' })
        )
      ));
    }
    var plan = el('section', { class: 'detail-section' }, el('h3', { text: 'Farm plan' }));
    plan.appendChild(el('div', { class: 'plan-total' },
      el('span', null, 'Capital ', el('b', { text: fmtUsd(row.farm_capital_usd) })),
      el('span', null, 'Run length ', el('b', { text: row.farm_weeks + ' weeks' })),
      el('span', null, 'Position ', el('b', { text: 'one wallet, ' + (row.chains && row.chains.length ? row.chains[0] : 'main chain') + ' first' }))
    ));
    plan.appendChild(el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    })));
    plan.appendChild(el('p', { class: 'note', text: 'The plan is generated from this protocol\'s category, chains, TVL and age, and is the same text board.json carries. Farming is a record of real use, not a guarantee: most protocols on this board will never issue a token, and a position can lose money even when one does.' }));
    inner.appendChild(plan);
    dialog.textContent = '';
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.segment === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
      shell.appendChild(screenPanel());
    }
    shell.appendChild(el('footer', null,
      el('span', { text: 'Data: ' + DATA.source + '. Implied values are this dashboard\'s model (' + DATA.model_version + '), not prices, predictions or advice.' }),
      el('span', { text: 'Board: ' + DATA.board_size + ' pre-token rows · ' + DATA.live_size + ' live-token protocols set aside' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (keepFocus) {
      var target = document.getElementById(keepFocus);
      keepFocus = null;
      if (target) {
        target.focus();
        if (typeof target.setSelectionRange === 'function') {
          var end = target.value.length;
          target.setSelectionRange(end, end);
        }
      }
    }
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
