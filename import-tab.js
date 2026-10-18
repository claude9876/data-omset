/* Tab "Stok": stok per warna & ukuran + peringatan restok.
 * Stok sekarang = stok fisik terakhir dihitung − penjualan "Selesai" SETELAH tanggal hitung.
 * Retur dan Dibatalkan tidak mengubah stok. Dimuat setelah import-tab.js.
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

  /* ---------- gaya ---------- */
  const st = document.createElement('style');
  st.textContent = `
  .tabbar-in{grid-template-columns:repeat(6,1fr) !important;}
  .tabbar button{font-size:11px;}
  .tabbar button svg{width:22px;height:22px;}
  .tag.ok{background:var(--pos-bg);color:var(--pos);}
  .row.s-habis{box-shadow:inset 4px 0 0 var(--neg);}
  .row.s-segera{box-shadow:inset 4px 0 0 var(--kunyit);}
  #tab-s pre{white-space:pre-wrap;font:12px/1.4 var(--mono);background:var(--surface);color:var(--ink);padding:10px;border-radius:10px;overflow-x:auto;margin:8px 0;}
  #tab-s summary{cursor:pointer;font-weight:650;}`;
  document.head.appendChild(st);

  /* ---------- tab, halaman, lembar ubah ---------- */
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4z"/><path d="M3.5 8L12 12l8.5-4M12 12v8"/></svg>';
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

  const sheet = document.createElement('form');
  sheet.className = 'sheet'; sheet.id = 'sheetS'; sheet.hidden = true; sheet.noValidate = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'sheetSTitle');
  sheet.setAttribute('autocomplete', 'off');
  sheet.innerHTML = `
    <div class="sheet-head"><h2 id="sheetSTitle">Hitung stok</h2>
      <button type="button" class="icon-btn" id="s_close" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="sheet-body">
      <div><div class="row-title" id="s_name"></div><div class="row-sub" id="s_prod"></div></div>
      <div class="field"><label for="s_qty">Stok fisik sekarang (pcs)</label>
        <input id="s_qty" type="number" inputmode="numeric" min="0" step="1" data-autofocus></div>
      <p class="hint" id="s_hint"></p>
    </div>
    <div class="sheet-foot"><button type="submit" class="btn primary" id="s_save">Simpan stok</button></div>`;
  document.body.appendChild(sheet);
  $('s_close').addEventListener('click', closeSheet);

  /* ---------- hitung ---------- */
  let items = [], editing = null, saving = false, req = 0;

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
  const TAG = {habis: ['Retur', 'Habis'], segera: ['warn', 'Segera restok'], perhatian: ['warn', 'Perhatikan'], belum: ['Dibatalkan', 'Belum diisi'], aman: ['ok', 'Aman']};
  const fmtDays = d => d < 1 ? 'kurang dari 1 hari' : '±' + Math.floor(d) + ' hari lagi';

  function render() {
    const cnt = {habis: 0, segera: 0, perhatian: 0, belum: 0, aman: 0};
    items.forEach(i => cnt[i.state]++);
    if (!items.length) {
      $('s_out').innerHTML = `<div class="ledger"><div class="empty">${ICON.tag}<h3>Belum ada varian</h3>
        <p>Varian muncul otomatis dari penjualan yang punya warna dan ukuran. Impor file Order dulu.</p></div></div>`;
      return;
    }
    const sum = `<div class="sumline"><span>Habis <b>${cnt.habis}</b> · Segera <b>${cnt.segera}</b> · Perhatikan <b>${cnt.perhatian}</b></span>
      <span>${cnt.belum ? `<span class="tag warn">${cnt.belum} belum diisi</span>` : ''}</span></div>`;
    const rows = items.map((it, i) => {
      const [cls, label] = TAG[it.state];
      const name = [it.variasi, it.ukuran].filter(Boolean).join(' · ') || 'Tanpa variasi';
      const meta = it.state === 'belum' ? 'Ketuk untuk mengisi stok awal'
        : it.rate > 0 ? `Laku ${it.rate.toFixed(1).replace('.', ',')} pcs/hari${it.days !== null && it.left > 0 ? ' · ' + fmtDays(it.days) : ''}`
        : `Tidak ada penjualan ${DAYS} hari terakhir`;
      return `<button type="button" class="row s-${it.state}" data-i="${i}">
        <span class="row-main"><span class="row-title">${esc(name)}</span>
          <span class="row-sub">${esc(it.produk)}</span><span class="row-meta"><span>${esc(meta)}</span></span></span>
        <span class="row-amt">${it.left === null ? '' : `<b class="${it.left <= 0 ? 'neg' : ''}">${it.left}</b><small>pcs</small><br>`}<span class="tag ${cls}">${label}</span></span>
      </button>`;
    }).join('');
    $('s_out').innerHTML = sum + `<div class="ledger">${rows}</div>`;
  }

  function renderSetup() {
    $('s_out').innerHTML = `<div class="callout"><b>Tabel stok belum dibuat di Supabase.</b> Sekali saja: buka Supabase → SQL Editor, tempel perintah di bawah, lalu tekan Run. Setelah itu muat ulang tab ini.
      <details style="margin-top:8px"><summary>Lihat perintah SQL</summary><pre id="s_sql">${esc(SQL)}</pre>
      <button class="btn secondary" type="button" id="s_copy">Salin perintah</button></details></div>
      <button class="btn primary block" type="button" id="s_retry">Muat ulang</button>`;
    $('s_copy').onclick = async () => {
      try { await navigator.clipboard.writeText(SQL); toast('Perintah SQL disalin.'); }
      catch (_) { toast('Tidak bisa menyalin otomatis. Tekan dan tahan teks SQL untuk menyalin.', {kind: 'warn'}); }
    };
    $('s_retry').onclick = loadStok;
  }

  /* ---------- muat ---------- */
  async function loadStok() {
    const out = $('s_out');
    if (!sb) { out.innerHTML = ''; return; }
    const token = ++req;
    out.innerHTML = `<div class="ledger">${skelRows(4)}</div>`;
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
      out.innerHTML = `<div class="ledger"><div class="empty">${ICON.warn}<h3>Stok belum bisa dimuat</h3>
        <p>${esc(friendlyError(e))}</p><div class="btn-row"><button class="btn primary" type="button" id="s_retry">Coba lagi</button></div></div></div>`;
      $('s_retry').onclick = loadStok;
    }
  }

  /* ---------- ubah stok ---------- */
  $('s_out').addEventListener('click', e => {
    const b = e.target.closest('.row[data-i]');
    if (!b) return;
    editing = items[Number(b.dataset.i)];
    if (!editing) return;
    $('s_name').textContent = [editing.variasi, editing.ukuran].filter(Boolean).join(' · ') || 'Tanpa variasi';
    $('s_prod').textContent = editing.produk;
    $('s_qty').value = editing.left === null ? '' : Math.max(0, editing.left);
    $('s_hint').textContent = editing.left === null
      ? 'Hitung stok fisik sekarang. Penjualan yang dicatat mulai besok otomatis mengurangi stok ini.'
      : `Stok tercatat sekarang ${editing.left} pcs. Isi angka yang benar bila berbeda. Barang baru datang? Isi total stok setelah barang masuk.`;
    openSheet('sheetS');
  });

  sheet.addEventListener('submit', async e => {
    e.preventDefault();
    if (saving || !editing) return;
    const raw = String($('s_qty').value).trim(), qty = Number(raw);
    if (raw === '' || !Number.isInteger(qty) || qty < 0) { toast('Isi jumlah stok berupa angka bulat 0 atau lebih.', {kind: 'err'}); return; }
    saving = true; $('s_save').disabled = true;
    try {
      const base = editing.row || editing;      // pakai penulisan nama yang sudah tersimpan agar tidak bentrok
      must(await sb.from('stok').upsert(
        {produk: base.produk, variasi: base.variasi || '', ukuran: base.ukuran || '', stok_awal: qty, dihitung_pada: todayStr()},
        {onConflict: 'produk,variasi,ukuran'}), 'Simpan stok');
      toast('Stok disimpan.');
      closeSheet();
      await loadStok();
    } catch (err) { fail(err); }
    finally { saving = false; $('s_save').disabled = false; }
  });

  tabBtn.addEventListener('click', () => { showTab('s'); loadStok(); });
})();
