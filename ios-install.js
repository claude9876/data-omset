/* Petunjuk "Tambah ke Layar Utama" untuk iPhone/iPad.
 * iOS tidak punya tombol pasang otomatis seperti Android, jadi banner ini
 * menuntun pengguna. Hanya tampil di iOS, di luar mode aplikasi, dan bisa ditutup.
 * Memakai kelas CSS .banner.install yang sudah ada di index.html.
 */
(function () {
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (!isIOS || standalone) return;

  var KEY = 'ios_install_dismissed';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}

  var share = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px">' +
    '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1"/></svg>';

  var el = document.createElement('div');
  el.className = 'banner install';
  el.setAttribute('role', 'note');
  el.innerHTML = '<span>Pasang di iPhone: ketuk ' + share + ' <b>Bagikan</b>, lalu pilih ' +
    '<b>Tambah ke Layar Utama</b>.</span>' +
    '<button class="btn secondary" type="button">Mengerti</button>';
  el.querySelector('button').addEventListener('click', function () {
    el.remove();
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
  });

  var anchor = document.getElementById('installBanner') || document.getElementById('offlineBanner');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
  else document.body.insertBefore(el, document.body.firstChild);
})();
