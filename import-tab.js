/* Tab "Impor": unggah file Excel Shopee + total terjual per warna dan ukuran.
 * Dimuat SETELAH skrip utama di index.html, memakai fungsi yang sudah ada
 * (sb, must, fetchAll, parseMoney, findHpp, toast, showTab, dst).
 */
(function () {
  'use strict';

  /* ---------- gaya ---------- */
  const st = document.createElement('style');
  st.textContent = `
  .tabbar-in{grid-template-columns:repeat(5,1fr) !important;}
  .tabbar button{font-size:11.5px;}
  .vrow{display:grid;grid-template-columns:minmax(0,125px) 1fr auto;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);font-size:14px;}
  .vrow:last-child{border-bottom:0;}
  .vname{font-weight:600;overflow-wrap:anywhere;}
  .vbar{height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden;}
  .vbar i{display:block;height:100%;background:var(--btn);border-radius:4px;}
  .vqty{font-family:var(--mono);font-weight:700;text-align:right;white-space:nowrap;}
  .vqty small{font-weight:400;color:var(--ink-3);font-family:var(--font);}
  .vhead{font-size:14px;font-weight:700;margin:18px 2px 8px;color:var(--ink-2);}
  .mtx{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:14px;}
  .mtx table{border-collapse:collapse;width:100%;font-size:13.5px;}
  .mtx th,.mtx td{padding:9px 12px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap;}
  .mtx th:first-child,.mtx td:first-child{text-align:left;font-weight:600;}
  .mtx th,.mtx tfoot td{font-weight:700;background:var(--surface-2);}
  .mtx tfoot td{border-bottom:0;}
  #tab-i .dropzone{margin-bottom:12px;}`;
  document.head.appendChild(st);

  /* ---------- tab & halaman ---------- */
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5"/><path d="M5 19h14"/></svg>';
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.dataset.tab = 'i';
  tabBtn.innerHTML = icon + 'Impor';
  document.querySelector('.tabbar-in').appendChild(tabBtn);

  const sec = document.createElement('section');
  sec.id = 'tab-i';
  sec.className = 'tab';
  sec.setAttribute('aria-label', 'Impor');
  sec.innerHTML = `
  <div class="wrap">
    <div class="pagehead">
      <h2>Impor pesanan</h2>
      <p>Pilih file Order atau Penghasilan dari Shopee. Jenis file dikenali otomatis, dan pesanan yang sudah pernah diimpor dilewati.</p>
    </div>
    <label class="dropzone" id="i_drop">${icon}
      <strong>Pilih file Excel</strong>
      <span class="fname" id="i_name">.xlsx, .xls, atau .csv</span>
      <input type="file" id="i_file" accept=".xlsx,.xls,.csv">
    </label>
    <div id="i_val"></div>
    <button class="btn primary block" id="i_go" type="button" disabled>Proses file</button>
    <div class="impmsg" id="i_msg" role="status" hidden style="margin-top:12px"></div>

    <section class="block" aria-label="Terjual per warna dan ukuran">
      <h3>Terjual per warna dan ukuran</h3>
      <div class="chips" id="i_chips" role="group" aria-label="Pilih periode">
        <button class="chip active" type="button" data-p="all" aria-pressed="true">Semua</button>
        <button class="chip" type="button" data-p="month" aria-pressed="false">Bulan ini</button>
        <button class="chip" type="button" data-p="30d" aria-pressed="false">30 hari</button>
      </div>
      <div id="i_out" style="margin-top:6px"></div>
    </section>
  </div>`;
  $('main').appendChild(sec);

  tabBtn.addEventListener('click', () => { showTab('i'); loadVar(); });

  /* ---------- pesan ---------- */
  function msg(text, kind) {
    const el = $('i_msg');
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'impmsg' + (kind ? ' ' + kind : '');
  }

  /* ---------- baca file Shopee ---------- */
  function parseWorkbook(buf) {
    const wb = XLSX.read(new Uint8Array(buf), {type: 'array', cellDates: true});
    const name = wb.SheetNames.find(s => /penghasilan/i.test(s)) || wb.SheetNames[0];
    const sh = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(sh, {header: 1, defval: ''});
    let hi = -1, type = '';
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const r = raw[i].map(x => String(x).trim());
      if (r.includes('No. Pesanan') && r.includes('Total Penghasilan')) { hi = i; type = 'income'; break; }
      if (r.includes('No. Pesanan') && (r.includes('Status Pesanan') || r.includes('Waktu Pesanan Dibuat'))) { hi = i; type = 'order'; break; }
    }
    if (hi < 0) return null;
    const rows = XLSX.utils.sheet_to_json(sh, {range: hi, defval: '', cellDates: true});
    const out = []; let fixed = 0;

    rows.forEach(row => {
      const no = row['No. Pesanan'];
      const produk = String(row['Nama Produk'] || '').trim();
      if (!no || !produk) return;
      const tanggal = parseExcelDate(row['Waktu Pesanan Dibuat']);

      if (type === 'income') {
        if (String(row['Lihat berdasarkan'] || '').toLowerCase().trim() !== 'sku') return;
        const qty = parseInt(row['Jumlah'] || row['Qty'] || 1) || 1;
        const total = parseMoney(row['Harga Produk']);
        const hasil = parseMoney(row['Total Penghasilan']);
        const kembali = parseMoney(row['Jumlah Pengembalian Dana ke Pembeli']);
        const status = (kembali > 0 || hasil <= 0) ? 'Retur' : 'Selesai';
        out.push({
          tanggal, no_pesanan: String(no), produk, variasi: '', ukuran: '', qty,
          harga: qty > 1 ? Math.round(total / qty) : total, status,
          biaya_admin: status === 'Selesai' ? Math.max(0, total - hasil) : 0,
          hpp_satuan: findHpp(produk)
        });
      } else {
        const rawVar = String(row['Nama Variasi'] || '').trim();
        let variasi = rawVar, ukuran = '';
        if (rawVar.includes(',')) {
          const parts = rawVar.split(',');
          ukuran = parts.pop().trim();
          variasi = parts.join(',').trim();
        }
        const v0 = variasi, u0 = ukuran;
        variasi = cleanColor(variasi); ukuran = cleanSize(ukuran);
        if (variasi !== v0 || ukuran !== u0) fixed++;
        const qty = parseInt(row['Jumlah']) || 1;
        const harga = parseMoney(row['Harga Setelah Diskon'] || row['Harga Produk']);
        const subtotal = parseMoney(row['Subtotal Pesanan']);
        const bayar = parseMoney(row['Total Pembayaran']);
        const rs = String(row['Status Pesanan'] || '').toLowerCase();
        let status = 'Selesai';
        if (rs.includes('batal')) status = 'Dibatalkan';
        else if (rs.includes('retur') || rs.includes('pengembalian')) status = 'Retur';
        out.push({
          tanggal, no_pesanan: String(no), produk, variasi, ukuran, qty, harga, status,
          biaya_admin: (subtotal > 0 && bayar > 0 && subtotal > bayar) ? subtotal - bayar : 0,
          hpp_satuan: findHpp(produk, variasi, ukuran)
        });
      }
    });
    return {type, out, fixed};
  }

  /* ---------- proses & simpan ---------- */
  $('i_file').addEventListener('change', e => {
    const f = e.target.files[0];
    $('i_drop').classList.toggle('has-file', !!f);
    $('i_name').textContent = f ? f.name : '.xlsx, .xls, atau .csv';
    $('i_go').disabled = !f;
    msg('');
    checkFile(f);
  });

  /* ---------- validasi warna & ukuran ---------- */
  const spaces = x => String(x || '').replace(/\s+/g, ' ').trim();
  function cleanColor(v) {
    v = spaces(v);
    if (v && (v === v.toLowerCase() || v === v.toUpperCase()))
      v = v.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
    return v;
  }
  function cleanSize(u) { u = spaces(u); return u.length <= 5 ? u.toUpperCase() : u; }
  function lev(a, b) {
    const d = Array.from({length: a.length + 1}, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function validationHtml(p) {
    if (p.type !== 'order') {
      return '<div class="impmsg">File Penghasilan tidak memuat warna dan ukuran. Untuk total per warna dan ukuran, impor juga file Order.</div>';
    }
    const rows = p.out, orders = new Set(rows.map(r => r.no_pesanan)).size;
    const colors = new Map(), sizes = new Set(), noC = [], noS = [], badS = [];
    rows.forEach(r => {
      if (r.variasi) colors.set(r.variasi, (colors.get(r.variasi) || 0) + r.qty); else noC.push(r.no_pesanan);
      if (r.ukuran) { sizes.add(r.ukuran); if (sizeRank(r.ukuran) === 99) badS.push(r.ukuran); } else noS.push(r.no_pesanan);
    });
    const typo = [];
    colors.forEach((qa, a) => colors.forEach((qb, b) => {
      if (qa <= 2 && qb > qa && lev(a.toLowerCase(), b.toLowerCase()) <= 2) typo.push(`"${a}" (${qa} pcs) mirip "${b}" (${qb} pcs)`);
    }));
    const smp = a => { const u = [...new Set(a)]; return u.slice(0, 4).join(', ') + (u.length > 4 ? ', …' : ''); };
    const list = [];
    if (noC.length) list.push(`${noC.length} baris tanpa warna (pesanan ${smp(noC)})`);
    if (noS.length) list.push(`${noS.length} baris tanpa ukuran (pesanan ${smp(noS)})`);
    if (badS.length) list.push(`Ukuran tidak dikenal: ${smp(badS)}`);
    typo.slice(0, 4).forEach(t => list.push('Mungkin salah ketik: ' + t));
    const head = `${rows.length} baris · ${orders} pesanan · ${colors.size} warna · ${sizes.size} ukuran.`;
    const fx = p.fixed ? ` ${p.fixed} baris dirapikan penulisannya otomatis.` : '';
    if (!list.length) return `<div class="impmsg ok"><b>Warna dan ukuran valid.</b> ${esc(head + fx)}</div>`;
    return `<div class="callout"><b>Periksa dulu sebelum disimpan.</b> ${esc(head + fx)}
      <ul style="margin:8px 0 8px 18px;padding:0">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      Data tetap bisa disimpan. Perbaikan bisa dilakukan lewat edit transaksi.</div>`;
  }

  let cache = null;
  async function checkFile(f) {
    cache = null;
    $('i_val').innerHTML = '';
    if (!f || typeof XLSX === 'undefined') return;
    $('i_val').innerHTML = '<div class="impmsg">Memeriksa warna dan ukuran…</div>';
    try {
      const p = parseWorkbook(await f.arrayBuffer());
      if (f !== $('i_file').files[0]) return;
      if (!p) { $('i_val').innerHTML = ''; return; }
      cache = {file: f, p};
      $('i_val').innerHTML = validationHtml(p);
    } catch (err) { console.error(err); $('i_val').innerHTML = ''; }
  }

  /* Pesanan lama yang tersimpan tanpa variasi (mis. dulu diimpor dari file
     Penghasilan) dilengkapi warna & ukurannya dari file Order. HPP yang masih
     kosong ikut diisi dari Master HPP. Data lain tidak diubah. */
  async function fillVariasi(fileRows, exist) {
    const norm = s => String(s || '').trim().toLowerCase();
    const byNo = new Map();
    fileRows.forEach(t => {
      const k = String(t.no_pesanan);
      if (!exist.has(k) || !(t.variasi || t.ukuran)) return;
      if (!byNo.has(k)) byNo.set(k, []);
      byNo.get(k).push(t);
    });
    if (!byNo.size) return 0;

    const dbBy = new Map();
    for (const part of chunk([...byNo.keys()], IN_CHUNK)) {
      const rows = await fetchAll(
        () => sb.from('transaksi').select('id, no_pesanan, produk, qty, variasi, hpp_satuan')
          .in('no_pesanan', part).order('id'), 'Cek variasi lama');
      rows.filter(r => !String(r.variasi || '').trim()).forEach(r => {
        const k = String(r.no_pesanan);
        if (!dbBy.has(k)) dbBy.set(k, []);
        dbBy.get(k).push(r);
      });
    }

    const groups = new Map(), needHpp = [];
    byNo.forEach((list, no) => {
      const cand = dbBy.get(no) || [];
      list.forEach(t => {
        let i = cand.findIndex(r => norm(r.produk) === norm(t.produk) && Number(r.qty) === t.qty);
        if (i < 0) i = cand.findIndex(r => norm(r.produk) === norm(t.produk));
        if (i < 0 && list.length === 1 && cand.length === 1) i = 0;
        if (i < 0) return;
        const r = cand.splice(i, 1)[0];
        const k = t.variasi + '\u0001' + t.ukuran;
        if (!groups.has(k)) groups.set(k, {variasi: t.variasi, ukuran: t.ukuran, ids: []});
        groups.get(k).ids.push(r.id);
        if (!(Number(r.hpp_satuan) > 0)) needHpp.push({id: r.id, produk: t.produk, variasi: t.variasi, ukuran: t.ukuran});
      });
    });

    let n = 0;
    for (const g of groups.values()) {
      for (const part of chunk(g.ids, IN_CHUNK)) {
        must(await sb.from('transaksi').update({variasi: g.variasi, ukuran: g.ukuran}).in('id', part), 'Lengkapi variasi');
        n += part.length;
      }
    }
    if (needHpp.length) await applyMasterHpp(needHpp);
    return n;
  }

  async function runImport() {
    const input = $('i_file'), btn = $('i_go');
    const file = input.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { msg('Pustaka Excel belum termuat. Periksa internet, lalu muat ulang halaman.', 'err'); return; }
    btn.disabled = true;
    try {
      msg('Membaca file…');
      const p = (cache && cache.file === file) ? cache.p : parseWorkbook(await file.arrayBuffer());
      if (!p) { msg('Format file tidak dikenali. Pastikan ini file Order atau Penghasilan dari Shopee.', 'err'); return; }
      if (!p.out.length) { msg('Tidak ada data yang bisa diimpor dari file ini.', 'err'); return; }

      msg(`Memeriksa ${p.out.length} baris…`);
      const exist = await findExistingOrderNos([...new Set(p.out.map(t => t.no_pesanan))]);
      const fresh = p.out.filter(t => !exist.has(String(t.no_pesanan)));
      const dup = p.out.length - fresh.length;
      let filled = 0;
      if (p.type === 'order' && dup) {
        msg('Melengkapi warna dan ukuran pesanan lama…');
        filled = await fillVariasi(p.out, exist);
      }
      if (!fresh.length) {
        if (filled) {
          markDirty();
          msg(`Semua pesanan sudah ada. ${filled} baris lama dilengkapi warna dan ukurannya.`, 'ok');
          toast(`${filled} baris dilengkapi warna dan ukuran.`, {ms: 5000});
          setPeriod('all'); loadVar();
          loadDay($('selDate').value, true).catch(() => {});
        } else {
          msg('Semua pesanan di file ini sudah ada di database dan warna/ukurannya sudah lengkap. Tidak ada yang baru.', 'ok');
        }
        return;
      }

      let saved = 0;
      for (const part of batchByOrder(fresh, INSERT_CHUNK)) {
        msg(`Menyimpan ${saved} dari ${fresh.length} baris…`);
        try { must(await sb.from('transaksi').insert(part), 'Simpan import'); }
        catch (err) {
          markDirty();
          msg(`Gagal setelah ${saved} dari ${fresh.length} baris tersimpan. Ulangi impor: pesanan yang sudah masuk dilewati otomatis.`, 'err');
          err.handled = true; throw err;
        }
        saved += part.length;
      }

      markDirty();
      const noHpp = fresh.filter(t => t.status === 'Selesai' && !(t.hpp_satuan > 0)).length;
      let text = `Berhasil: ${saved} baris disimpan` + (dup ? `, ${dup} dilewati (sudah ada).` : '.');
      if (filled) text += ` ${filled} baris lama dilengkapi warna dan ukurannya.`;
      if (noHpp) text += ` ${noHpp} baris belum punya HPP, isi di tab Master HPP.`;
      msg(text, 'ok');
      toast(`Impor ${p.type === 'income' ? 'Penghasilan' : 'Order'}: ${saved} baris disimpan.`, {ms: 5000});
      input.value = '';
      cache = null; $('i_val').innerHTML = '';
      $('i_drop').classList.remove('has-file');
      $('i_name').textContent = '.xlsx, .xls, atau .csv';
      setPeriod('all'); loadVar();
      loadDay($('selDate').value, true).catch(() => {});
    } catch (err) {
      console.error(err);
      if (!err.handled) msg('Error: ' + friendlyError(err), 'err');
    } finally {
      btn.disabled = !input.files.length;
    }
  }
  $('i_go').addEventListener('click', runImport);

  /* ---------- total per warna & ukuran ---------- */
  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL'];
  const sizeRank = s => { const i = SIZES.indexOf(s.toUpperCase()); return i < 0 ? 99 : i; };

  function tally(rows) {
    const W = new Map(), U = new Map(), X = new Map();
    let total = 0;
    const add = (m, k, label, q) => { const e = m.get(k) || {label, qty: 0}; e.qty += q; m.set(k, e); };
    rows.forEach(r => {
      const q = Number(r.qty) || 0;
      const w = String(r.variasi || '').trim() || 'Tanpa variasi';
      const u = String(r.ukuran || '').trim() || 'Tanpa ukuran';
      const wk = w.toLowerCase(), uk = u.toUpperCase();
      total += q;
      add(W, wk, w, q);
      add(U, uk, u.length <= 5 ? uk : u, q);
      add(X, wk + '|' + uk, '', q);
    });
    return {W, U, X, total};
  }

  function barRows(m, sorter, total) {
    const list = [...m.entries()].sort(sorter);
    const max = Math.max(1, ...list.map(([, e]) => e.qty));
    return `<div class="ledger">${list.map(([, e]) => `
      <div class="vrow">
        <span class="vname">${esc(e.label)}</span>
        <span class="vbar"><i style="width:${Math.max(2, e.qty / max * 100).toFixed(1)}%"></i></span>
        <span class="vqty">${e.qty.toLocaleString('id-ID')} <small>pcs · ${pct(e.qty / total * 100)}%</small></span>
      </div>`).join('')}</div>`;
  }

  function renderVar(rows) {
    if (!rows.length) {
      return `<div class="ledger"><div class="empty">${ICON.tag}<h3>Belum ada penjualan selesai</h3>
        <p>Impor file Excel dari Shopee atau catat transaksi, lalu angkanya muncul di sini.</p></div></div>`;
    }
    const {W, U, X, total} = tally(rows);
    const byQty = (a, b) => b[1].qty - a[1].qty || a[1].label.localeCompare(b[1].label);
    const bySize = (a, b) => sizeRank(a[0]) - sizeRank(b[0]) || a[0].localeCompare(b[0]);
    const colors = [...W.entries()].sort(byQty);
    const sizes = [...U.entries()].sort(bySize);

    const matrix = `<div class="mtx"><table>
      <thead><tr><th>Warna</th>${sizes.map(([, s]) => `<th>${esc(s.label)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${colors.map(([wk, w]) => `<tr><td>${esc(w.label)}</td>${sizes.map(([uk]) => {
        const c = X.get(wk + '|' + uk); return `<td>${c ? c.qty : '–'}</td>`;
      }).join('')}<td><b>${w.qty}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>${sizes.map(([, s]) => `<td>${s.qty}</td>`).join('')}<td>${total}</td></tr></tfoot>
    </table></div>`;

    return `<div class="sumline" style="margin-top:12px"><span>Total terjual <b>${total.toLocaleString('id-ID')} pcs</b></span>
        <span>${colors.length} warna · ${sizes.length} ukuran</span></div>
      <div class="vhead">Per warna</div>${barRows(W, byQty, total)}
      <div class="vhead">Per ukuran</div>${barRows(U, bySize, total)}
      <div class="vhead">Rincian warna × ukuran</div>${matrix}`;
  }

  let per = 'all', varReq = 0;
  function periodRange() {
    const t = todayStr();
    if (per === 'month') return [t.slice(0, 8) + '01', t];
    if (per === '30d') return [addDays(t, -29), t];
    return null;
  }
  function setPeriod(p) {
    per = p;
    qsa('#i_chips .chip').forEach(b => {
      const on = b.dataset.p === p;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  $('i_chips').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    setPeriod(b.dataset.p);
    loadVar();
  });

  async function loadVar() {
    const out = $('i_out');
    if (!sb) { out.innerHTML = ''; return; }
    const token = ++varReq;
    out.innerHTML = `<div class="ledger" style="margin-top:12px">${skelRows(3)}</div>`;
    try {
      const rg = periodRange();
      const rows = await fetchAll(() => {
        let q = sb.from('transaksi').select('id, variasi, ukuran, qty').eq('status', 'Selesai');
        if (rg) q = q.gte('tanggal', rg[0]).lte('tanggal', rg[1]);
        return q.order('id');
      }, 'Memuat total warna dan ukuran');
      if (token !== varReq) return;
      out.innerHTML = renderVar(rows.map(r => ({...r, qty: Number(r.qty) || 0})));
    } catch (err) {
      if (token !== varReq) return;
      console.error(err);
      out.innerHTML = `<div class="ledger" style="margin-top:12px"><div class="empty">${ICON.warn}
        <h3>Belum bisa dimuat</h3><p>${esc(friendlyError(err))}</p>
        <div class="btn-row"><button class="btn primary" type="button" id="i_retry">Coba lagi</button></div></div></div>`;
      $('i_retry').onclick = loadVar;
    }
  }
})();
