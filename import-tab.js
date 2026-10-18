/* Tab "Stok": stok per warna & ukuran + peringatan restok.
 * Stok sekarang = stok fisik terakhir dihitung − penjualan "Selesai" SETELAH tanggal hitung.
 * Retur dan Dibatalkan tidak mengubah stok. Dimuat setelah import-tab.js.
 *
 * Tampilan: varian dikelompokkan per produk, disaring lewat chip status + pencarian,
 * stok awal bisa diisi sekaligus ("Isi semua stok"), dan segar-ulang setelah simpan
 * tidak mengosongkan layar.
 */
(function () {
  'use strict';
  const DAYS = 14, URGENT = 7, WATCH = 14;   // jendela laju jual, batas "segera", batas "perhatikan" (hari)
  const LOW = 3;                              // sisa stok (pcs) yang selalu dianggap "segera restok", walau tidak ada penjualan
  const SQL = `create table if not exists stok (
  id uuid primary key default gen_random_uuid(),
  produk text not null,
  variasi text not null default '',
  ukuran text not null default '',
  stok_awal integer not null default 0,
  dihitung_pada date not null default current_date,
  unique (produk, variasi, ukuran)
);
alter table stok enable row level security;
create policy "akses stok" on stok for all to anon, authenticated using (true) with check (true);`;

  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const FILTERS = [['semua', 'Semua'], ['habis', 'Habis'], ['segera', 'Segera restok'], ['perhatian', 'Perhatikan'], ['belum', 'Belum diisi'], ['aman', 'Aman']];
  const TAG = {habis: ['t-habis', 'Habis'], segera: ['warn', 'Segera restok'], perhatian: ['t-perhatian', 'Perhatikan'], belum: ['t-belum', 'Belum diisi'], aman: ['ok', 'Aman']};

  /* ---------- gaya ---------- */
  const st = document.createElement('style');
  st.textContent = `
  .tabbar-in{grid-template-columns:repeat(6,1fr) !important;}
  .tabbar button{font-size:11px;}
  .tabbar button svg{width:22px;height:22px;}

  /* label status */
  .tag.ok{background:var(--pos-bg);color:var(--pos);}
  .tag.t-habis{background:color-mix(in srgb,var(--neg) 14%,transparent);color:var(--neg);}
  .tag.t-perhatian{background:transparent;color:inherit;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--kunyit) 75%,transparent);}
  .tag.t-belum{background:color-mix(in srgb,currentColor 10%,transparent);color:inherit;}

  /* baris varian */
  #tab-s .row.s-habis{box-shadow:inset 4px 0 0 var(--neg);}
  #tab-s .row.s-segera{box-shadow:inset 4px 0 0 var(--kunyit);}
  #tab-s .row-meta{display:flex;flex-wrap:wrap;gap:2px 12px;}
  #tab-s .sz{display:inline-block;min-width:36px;margin-right:8px;padding:1px 7px;border-radius:6px;text-align:center;font-size:12px;font-weight:700;line-height:1.6;vertical-align:1px;background:color-mix(in srgb,currentColor 10%,transparent);}
  #tab-s .s-meter{display:block;height:3px;margin-top:8px;border-radius:2px;overflow:hidden;background:color-mix(in srgb,currentColor 12%,transparent);}
  #tab-s .s-meter i{display:block;height:100%;border-radius:inherit;background:var(--pos);}
  #tab-s .s-segera .s-meter i{background:var(--kunyit);}
  #tab-s .s-perhatian .s-meter i{background:color-mix(in srgb,var(--kunyit) 60%,transparent);}
  #tab-s .row:focus-visible,.s-chip:focus-visible,.stepper button:focus-visible{outline:2px solid var(--kunyit);outline-offset:2px;}

  /* kelompok produk */
  .sgroup{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:22px 2px 8px;}
  .sgroup:first-child{margin-top:4px;}
  .sgroup h3{margin:0;font-size:13px;font-weight:650;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
  .sgroup span{flex:none;font-size:12px;opacity:.65;white-space:nowrap;}

  /* saring & cari */
  .s-chips{display:flex;gap:8px;overflow-x:auto;margin:0 -2px;padding:2px 2px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
  .s-chips::-webkit-scrollbar{display:none;}
  .s-chip{flex:none;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;}
  .s-chip b{font-weight:700;font-variant-numeric:tabular-nums;opacity:.7;}
  .s-chip i{width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.45;}
  .s-chip i.d-habis{background:var(--neg);opacity:1;}
  .s-chip i.d-segera{background:var(--kunyit);opacity:1;}
  .s-chip i.d-perhatian{background:var(--kunyit);opacity:.5;}
  .s-chip i.d-aman{background:var(--pos);opacity:1;}
  .s-chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--surface);}
  .s-chip[aria-pressed="true"] b{opacity:.85;}
  .s-search{position:relative;margin-bottom:10px;}
  .s-search svg{position:absolute;left:13px;top:50%;width:18px;height:18px;transform:translateY(-50%);opacity:.55;pointer-events:none;}
  .s-search input{width:100%;box-sizing:border-box;min-height:44px;padding:0 14px 0 40px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);background:var(--surface);color:var(--ink);font:inherit;font-size:16px;}
  .s-bulk{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-bottom:12px;}

  /* lembar ubah: stepper + selisih */
  .stepper{display:flex;gap:8px;}
  .stepper input{flex:1;min-width:0;text-align:center;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;}
  .stepper button{flex:none;width:52px;min-height:52px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);background:var(--surface);color:var(--ink);font-size:24px;line-height:1;cursor:pointer;}
  #s_diff{min-height:1.4em;margin:0;}

  /* lembar isi semua */
  .b-group{margin:18px 0 4px;font-size:13px;font-weight:650;line-height:1.4;}
  .b-group:first-child{margin-top:4px;}
  .b-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent);}
  .b-row label{flex:1;min-width:0;font-size:15px;}
  .b-row input{flex:none;width:88px;box-sizing:border-box;min-height:44px;padding:0 10px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);background:var(--surface);color:var(--ink);text-align:center;font:inherit;font-size:16px;font-variant-numeric:tabular-nums;}
  .b-row input[aria-invalid="true"]{border-color:var(--neg);}

  #tab-s pre{white-space:pre-wrap;font:12px/1.4 var(--mono);background:var(--surface);color:var(--ink);padding:10px;border-radius:10px;overflow-x:auto;margin:8px 0;}
  #tab-s summary{cursor:pointer;font-weight:650;}`;
  document.head.appendChild(st);

  /* ---------- tab, halaman, lembar ubah ---------- */
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4z"/><path d="M3.5 8L12 12l8.5-4M12 12v8"/></svg>';
  const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button'; tabBtn.dataset.tab = 's'; tabBtn.innerHTML = icon + 'Stok';
  document.querySelector('.tabbar-in').appendChild(tabBtn);

  const sec = document.createElement('section');
  sec.id = 'tab-s'; sec.className = 'tab'; sec.setAttribute('aria-label', 'Stok');
  sec.innerHTML = `<div class="wrap">
    <div class="pagehead"><h2>Stok</h2>
      <p>Stok per warna dan ukuran, dikurangi otomatis oleh penjualan. Ketuk satu baris untuk mengisi atau menghitung ulang stok fisik.</p></div>
    <div id="s_out"></div></div>`;
  $('main').appendChild(sec);

  /* lembar: hitung satu varian */
  const sheet = document.createElement('form');
  sheet.className = 'sheet'; sheet.id = 'sheetS'; sheet.hidden = true; sheet.noValidate = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'sheetSTitle');
  sheet.setAttribute('autocomplete', 'off');
  sheet.innerHTML = `
    <div class="sheet-head"><h2 id="sheetSTitle">Hitung stok</h2>
      <button type="button" class="icon-btn" id="s_close" aria-label="Tutup">${closeIcon}</button></div>
    <div class="sheet-body">
      <div><div class="row-title" id="s_name"></div><div class="row-sub" id="s_prod"></div></div>
      <div class="field"><label for="s_qty">Stok fisik sekarang (pcs)</label>
        <div class="stepper">
          <button type="button" id="s_dec" aria-label="Kurangi 1">\u2212</button>
          <input id="s_qty" type="number" inputmode="numeric" min="0" step="1" data-autofocus>
          <button type="button" id="s_inc" aria-label="Tambah 1">+</button>
        </div></div>
      <p class="hint" id="s_diff" aria-live="polite"></p>
      <p class="hint" id="s_hint"></p>
    </div>
    <div class="sheet-foot"><button type="submit" class="btn primary" id="s_save">Simpan stok</button></div>`;
  document.body.appendChild(sheet);
  $('s_close').addEventListener('click', closeSheet);

  /* lembar: isi semua varian yang belum punya stok awal */
  const sheetB = document.createElement('form');
  sheetB.className = 'sheet'; sheetB.id = 'sheetB'; sheetB.hidden = true; sheetB.noValidate = true;
  sheetB.setAttribute('role', 'dialog'); sheetB.setAttribute('aria-modal', 'true'); sheetB.setAttribute('aria-labelledby', 'sheetBTitle');
  sheetB.setAttribute('autocomplete', 'off');
  sheetB.innerHTML = `
    <div class="sheet-head"><h2 id="sheetBTitle">Isi semua stok</h2>
      <button type="button" class="icon-btn" id="b_close" aria-label="Tutup">${closeIcon}</button></div>
    <div class="sheet-body">
      <p class="hint">Hitung stok fisik tiap varian, lalu isi jumlahnya. Varian yang dikosongkan dilewati dan bisa diisi nanti. Hitung setelah semua order hari ini terimpor, karena penjualan hari ini dianggap sudah termasuk hitunganmu.</p>
      <div id="b_list"></div>
    </div>
    <div class="sheet-foot"><button type="submit" class="btn primary" id="b_save" disabled>Simpan stok</button></div>`;
  document.body.appendChild(sheetB);
  $('b_close').addEventListener('click', closeSheet);

  /* ---------- hitung ---------- */
  let items = [], editing = null, saving = false, req = 0;
  let filter = 'semua', query = '';

  function compute(stokRows, tx) {
    const today = todayStr(), since14 = addDays(today, -(DAYS - 1));
    const map = new Map();
    const get = (p, v, u) => {
      const k = keyOf(p, v, u);
      if (!map.has(k)) map.set(k, {produk: p, variasi: v || '', ukuran: u || '', row: null, sold: 0, sold14: 0});
      return map.get(k);
    };
    stokRows.forEach(r => { const it = get(r.produk, r.variasi, r.ukuran); it.row = r; });
    tx.forEach(r => {
      const v = String(r.variasi || '').trim(), u = String(r.ukuran || '').trim();
      if (!v && !u) return;                                   // data lama tanpa variasi tidak ditampilkan
      const it = get(String(r.produk || '').trim(), v, u), q = Number(r.qty) || 0;
      if (it.row && r.tanggal > it.row.dihitung_pada) it.sold += q;
      if (r.tanggal >= since14) it.sold14 += q;
    });
    const rank = {habis: 0, segera: 1, perhatian: 2, belum: 3, aman: 4};
    const list = [...map.values()].map(it => {
      it.rate = it.sold14 / DAYS;
      it.left = it.row ? Number(it.row.stok_awal) - it.sold : null;
      it.days = (it.left !== null && it.rate > 0) ? it.left / it.rate : null;
      it.state = it.left === null ? 'belum' : it.left <= 0 ? 'habis'
        : (it.left <= LOW || (it.days !== null && it.days <= URGENT)) ? 'segera'
        : (it.days !== null && it.days <= WATCH) ? 'perhatian' : 'aman';
      return it;
    });
    list.sort((a, b) => rank[a.state] - rank[b.state] || (a.days ?? 1e9) - (b.days ?? 1e9) || a.variasi.localeCompare(b.variasi));
    return list;
  }

  /* ---------- tampilan ---------- */
  const fmtDays = d => d < 1 ? 'Habis dalam kurang dari 1 hari' : 'Habis \u00b1' + Math.floor(d) + ' hari lagi';
  const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Number(m[3]) + ' ' + BLN[Number(m[2]) - 1] : ''; };
  const fullName = it => it.variasi
    ? it.variasi + (it.ukuran ? ', ukuran ' + it.ukuran : '')
    : it.ukuran ? 'Ukuran ' + it.ukuran : 'Tanpa variasi';

  function rowHtml(it, i) {
    const [cls, label] = TAG[it.state];
    const title = it.variasi || (it.ukuran ? 'Tanpa warna' : 'Tanpa variasi');
    const badge = it.ukuran ? `<span class="sz">${esc(it.ukuran)}</span>` : '';
    const meta = [];
    if (it.state === 'belum') meta.push('Ketuk untuk mengisi stok awal');
    else {
      meta.push(it.rate > 0 ? `Laku ${it.rate.toFixed(1).replace('.', ',')} pcs/hari` : `Tidak ada penjualan ${DAYS} hari terakhir`);
      if (it.days !== null && it.left > 0) meta.push(fmtDays(it.days));
      if (it.row && it.row.dihitung_pada) meta.push('Dihitung ' + fmtDate(it.row.dihitung_pada));
    }
    const meter = (it.days !== null && it.left > 0)
      ? `<span class="s-meter" aria-hidden="true"><i style="width:${Math.max(6, Math.min(100, Math.round(it.days / (WATCH * 2) * 100)))}%"></i></span>` : '';
    const aria = `${fullName(it)}, ${it.produk}. ${it.left === null ? 'Stok belum diisi' : it.left + ' pcs'}, ${label}`;
    return `<button type="button" class="row s-${it.state}" data-i="${i}" aria-label="${esc(aria)}">
      <span class="row-main"><span class="row-title">${badge}${esc(title)}</span>
        <span class="row-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</span>${meter}</span>
      <span class="row-amt">${it.left === null ? '' : `<b class="${it.left <= 0 ? 'neg' : ''}">${it.left}</b><small>pcs</small><br>`}<span class="tag ${cls}">${label}</span></span>
    </button>`;
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const rows = [];
    items.forEach((it, i) => {
      if (filter !== 'semua' && it.state !== filter) return;
      if (q && !(it.variasi + ' ' + it.ukuran + ' ' + it.produk).toLowerCase().includes(q)) return;
      rows.push({it, i});
    });
    document.querySelectorAll('#s_out .s-chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === filter)));
    if (!rows.length) {
      $('s_list').innerHTML = `<div class="ledger"><div class="empty">${ICON.tag}<h3>Tidak ada varian yang cocok</h3>
        <p>Ubah kata kunci, atau tampilkan semua status.</p>
        <div class="btn-row"><button class="btn secondary" type="button" id="s_reset">Tampilkan semua</button></div></div></div>`;
      return;
    }
    const groups = new Map();                  // urutan kelompok = urutan varian terparah (daftar sudah terurut)
    rows.forEach(r => { if (!groups.has(r.it.produk)) groups.set(r.it.produk, []); groups.get(r.it.produk).push(r); });
    $('s_list').innerHTML = [...groups.entries()].map(([produk, rs]) =>
      `<div class="sgroup"><h3>${esc(produk)}</h3><span>${rs.length} varian</span></div>
       <div class="ledger">${rs.map(r => rowHtml(r.it, r.i)).join('')}</div>`).join('');
  }

  function render() {
    const cnt = {habis: 0, segera: 0, perhatian: 0, belum: 0, aman: 0};
    items.forEach(i => cnt[i.state]++);
    if (!items.length) {
      $('s_out').innerHTML = `<div class="ledger"><div class="empty">${ICON.tag}<h3>Belum ada varian</h3>
        <p>Varian muncul otomatis dari penjualan yang punya warna dan ukuran. Impor file Order dulu.</p></div></div>`;
      return;
    }
    if (filter !== 'semua' && !cnt[filter]) filter = 'semua';
    const showSearch = items.length > 8;
    if (!showSearch) query = '';
    const bulk = cnt.belum ? `<div class="callout s-bulk"><div><b>${cnt.belum} varian belum punya stok awal.</b> Isi semuanya dalam satu layar, tidak perlu satu per satu.</div>
      <button class="btn primary" type="button" id="s_bulk">Isi semua stok</button></div>` : '';
    const search = showSearch ? `<div class="s-search">${searchIcon}
      <input id="s_q" type="search" placeholder="Cari warna, ukuran, atau produk" aria-label="Cari varian" autocomplete="off" enterkeyhint="search"></div>` : '';
    const chips = FILTERS.filter(([k]) => k === 'semua' || cnt[k]).map(([k, label]) =>
      `<button type="button" class="s-chip" data-f="${k}" aria-pressed="${k === filter}">${k === 'semua' ? '' : `<i class="d-${k}" aria-hidden="true"></i>`}${label} <b>${k === 'semua' ? items.length : cnt[k]}</b></button>`).join('');
    $('s_out').innerHTML = bulk + search
      + `<div class="s-chips" role="group" aria-label="Saring menurut status">${chips}</div><div id="s_list"></div>`;
    if (showSearch) $('s_q').value = query;
    renderList();
  }

  function renderSetup() {
    $('s_out').innerHTML = `<div class="callout"><b>Tabel stok belum dibuat di Supabase.</b> Sekali saja: buka Supabase \u2192 SQL Editor, tempel perintah di bawah, lalu tekan Run. Setelah itu muat ulang tab ini.
      <details style="margin-top:8px"><summary>Lihat perintah SQL</summary><pre id="s_sql">${esc(SQL)}</pre>
      <button class="btn secondary" type="button" id="s_copy">Salin perintah</button></details></div>
      <button class="btn primary block" type="button" id="s_retry">Muat ulang</button>`;
    $('s_copy').onclick = async () => {
      try { await navigator.clipboard.writeText(SQL); toast('Perintah SQL disalin.'); }
      catch (_) { toast('Tidak bisa menyalin otomatis. Tekan dan tahan teks SQL untuk menyalin.', {kind: 'warn'}); }
    };
    $('s_retry').onclick = () => loadStok();
  }

  /* ---------- muat ---------- */
  async function loadStok(silent = false) {
    const out = $('s_out');
    if (!sb) { out.innerHTML = ''; return; }
    const token = ++req;
    if (!silent || !items.length) out.innerHTML = `<div class="ledger">${skelRows(4)}</div>`;
    try {
      let stokRows;
      try {
        stokRows = await fetchAll(() => sb.from('stok').select('*').order('id'), 'Memuat stok');
      } catch (e) {
        if (e.code === '42P01' || e.code === 'PGRST205' || /stok/i.test(e.message) && /schema cache|does not exist|relation/i.test(e.message)) {
          if (token === req) renderSetup();
          return;
        }
        throw e;
      }
      const dates = stokRows.map(r => r.dihitung_pada).filter(Boolean).sort();
      const from = [dates[0] || '9999', addDays(todayStr(), -(DAYS - 1))].sort()[0];
      const tx = await fetchAll(() => sb.from('transaksi').select('id, tanggal, produk, variasi, ukuran, qty')
        .eq('status', 'Selesai').gte('tanggal', from).order('id'), 'Memuat penjualan untuk stok');
      if (token !== req) return;
      items = compute(stokRows, tx);
      render();
    } catch (e) {
      if (token !== req) return;
      console.error(e);
      if (silent && items.length) { toast(friendlyError(e), {kind: 'err'}); return; }   // layar lama tetap tampil
      out.innerHTML = `<div class="ledger"><div class="empty">${ICON.warn}<h3>Stok belum bisa dimuat</h3>
        <p>${esc(friendlyError(e))}</p><div class="btn-row"><button class="btn primary" type="button" id="s_retry">Coba lagi</button></div></div></div>`;
      $('s_retry').onclick = () => loadStok();
    }
  }

  /* ---------- interaksi daftar ---------- */
  function openEdit(it) {
    editing = it;
    $('s_name').textContent = fullName(it);
    $('s_prod').textContent = it.produk;
    $('s_qty').value = it.left === null ? '' : Math.max(0, it.left);
    $('s_hint').textContent = it.left === null
      ? 'Hitung stok fisik sekarang. Penjualan yang dicatat mulai besok otomatis mengurangi stok ini.'
      : `Stok tercatat sekarang ${it.left} pcs. Isi angka yang benar bila berbeda. Barang baru datang? Isi total stok setelah barang masuk.`;
    updateDiff();
    openSheet('sheetS');
  }

  $('s_out').addEventListener('click', e => {
    const chip = e.target.closest('.s-chip[data-f]');
    if (chip) { filter = chip.dataset.f; renderList(); return; }
    if (e.target.closest('#s_reset')) { filter = 'semua'; query = ''; render(); return; }
    if (e.target.closest('#s_bulk')) { openBulk(); return; }
    const b = e.target.closest('.row[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    if (it) openEdit(it);
  });

  $('s_out').addEventListener('input', e => {
    if (e.target.id !== 's_q') return;
    query = e.target.value;
    renderList();
  });

  /* ---------- ubah stok satu varian ---------- */
  const qtyEl = $('s_qty');
  function updateDiff() {
    const el = $('s_diff'), raw = qtyEl.value.trim();
    if (!editing || editing.left === null || raw === '' || !Number.isFinite(Number(raw))) { el.textContent = ''; return; }
    const d = Math.round(Number(raw)) - editing.left;
    el.textContent = d === 0 ? 'Sama dengan stok tercatat.' : `Selisih ${d > 0 ? '+' : '\u2212'}${Math.abs(d)} pcs dari stok tercatat.`;
  }
  const bump = n => { qtyEl.value = Math.max(0, Math.floor(Number(qtyEl.value) || 0) + n); updateDiff(); };
  $('s_dec').addEventListener('click', () => bump(-1));
  $('s_inc').addEventListener('click', () => bump(1));
  qtyEl.addEventListener('input', updateDiff);

  sheet.addEventListener('submit', async e => {
    e.preventDefault();
    if (saving || !editing) return;
    const raw = String(qtyEl.value).trim(), qty = Number(raw);
    if (raw === '' || !Number.isInteger(qty) || qty < 0) { toast('Isi jumlah stok berupa angka bulat 0 atau lebih.', {kind: 'err'}); return; }
    saving = true; $('s_save').disabled = true;
    try {
      const base = editing.row || editing;      // pakai penulisan nama yang sudah tersimpan agar tidak bentrok
      must(await sb.from('stok').upsert(
        {produk: base.produk, variasi: base.variasi || '', ukuran: base.ukuran || '', stok_awal: qty, dihitung_pada: todayStr()},
        {onConflict: 'produk,variasi,ukuran'}), 'Simpan stok');
      toast('Stok disimpan.');
      closeSheet();
      await loadStok(true);
    } catch (err) { fail(err); }
    finally { saving = false; $('s_save').disabled = false; }
  });

  /* ---------- isi semua stok awal ---------- */
  function updateBulkCount() {
    const n = [...sheetB.querySelectorAll('#b_list input')].filter(i => i.value.trim() !== '').length;
    $('b_save').textContent = n ? `Simpan ${n} stok` : 'Simpan stok';
    $('b_save').disabled = saving || n === 0;
  }

  function openBulk() {
    const groups = new Map();
    items.forEach((it, i) => {
      if (it.state !== 'belum') return;
      if (!groups.has(it.produk)) groups.set(it.produk, []);
      groups.get(it.produk).push({it, i});
    });
    if (!groups.size) return;
    const cmp = (a, b) => a.it.variasi.localeCompare(b.it.variasi) || a.it.ukuran.localeCompare(b.it.ukuran, undefined, {numeric: true});
    let n = 0;
    const total = [...groups.values()].reduce((s, g) => s + g.length, 0);
    $('b_list').innerHTML = [...groups.entries()].map(([produk, rs]) =>
      `<div class="b-group">${esc(produk)}</div>` + rs.sort(cmp).map(({it, i}) => {
        n++;
        const badge = it.ukuran ? `<span class="sz">${esc(it.ukuran)}</span>` : '';
        return `<div class="b-row"><label for="b_${i}">${badge}${esc(it.variasi || (it.ukuran ? 'Tanpa warna' : 'Tanpa variasi'))}</label>
          <input id="b_${i}" data-i="${i}" type="number" inputmode="numeric" min="0" step="1" placeholder="0" enterkeyhint="${n === total ? 'done' : 'next'}"${n === 1 ? ' data-autofocus' : ''}></div>`;
      }).join('')).join('');
    updateBulkCount();
    openSheet('sheetB');
  }

  $('b_list').addEventListener('input', e => {
    if (e.target.matches('input')) { e.target.removeAttribute('aria-invalid'); updateBulkCount(); }
  });
  $('b_list').addEventListener('keydown', e => {                 // Enter pindah ke kolom berikutnya
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    const all = [...sheetB.querySelectorAll('#b_list input')], nxt = all[all.indexOf(e.target) + 1];
    (nxt || $('b_save')).focus();
  });

  sheetB.addEventListener('submit', async e => {
    e.preventDefault();
    if (saving) return;
    const rows = [];
    for (const inp of sheetB.querySelectorAll('#b_list input')) {
      const raw = inp.value.trim();
      if (raw === '') continue;
      const qty = Number(raw);
      if (!Number.isInteger(qty) || qty < 0) {
        inp.setAttribute('aria-invalid', 'true'); inp.focus();
        toast('Isi jumlah stok berupa angka bulat 0 atau lebih.', {kind: 'err'}); return;
      }
      const it = items[Number(inp.dataset.i)];
      if (it) rows.push({produk: it.produk, variasi: it.variasi || '', ukuran: it.ukuran || '', stok_awal: qty, dihitung_pada: todayStr()});
    }
    if (!rows.length) { toast('Isi minimal satu stok.', {kind: 'err'}); return; }
    saving = true; $('b_save').disabled = true;
    try {
      must(await sb.from('stok').upsert(rows, {onConflict: 'produk,variasi,ukuran'}), 'Simpan stok');
      toast(rows.length + ' stok disimpan.');
      closeSheet();
      await loadStok(true);
    } catch (err) { fail(err); }
    finally { saving = false; updateBulkCount(); }
  });

  tabBtn.addEventListener('click', () => { showTab('s'); loadStok(items.length > 0); });
})();
