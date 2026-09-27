/* Scrolling down frees space for products, any scroll up brings things back.
   - Phones: the top nav and the sticky shop bar (tabs + search) both hide.
   - Larger screens: only the shop bar hides; the nav (with the sign-up
     button) always stays.
   Shared by every page. */

(function () {
  const root    = document.documentElement;
  const nav     = document.getElementById('nav');
  const shopBar = document.getElementById('shopBar');
  if (!nav) return;

  const phone = window.matchMedia('(max-width: 600px)');
  const MIN_DELTA = 6;   // ignore tiny finger jitters
  let lastY = window.scrollY;
  let ticking = false;

  // Nav and shop bar both slide up by this distance, so they move as one block
  function measureBar() {
    const h = nav.offsetHeight + (shopBar ? shopBar.offsetHeight : 0);
    root.style.setProperty('--header-h', h + 'px');
  }

  // Hiding is only allowed once the shop bar's own spot in the page has scrolled
  // off screen; hiding earlier would leave that spot as a blank strip above the
  // products. Pages without a shop bar just need to be past the nav.
  function canHide(y) {
    if (!shopBar) return y > nav.offsetHeight * 2;
    const above = shopBar.previousElementSibling;   // the hero
    if (!above) return false;
    return above.getBoundingClientRect().bottom + shopBar.offsetHeight <= 0;
  }

  function menuOpen() {
    const menu = document.getElementById('navMobile');
    return menu && menu.classList.contains('is-open');
  }

  function update() {
    ticking = false;
    const y = window.scrollY;

    // Phones hide everything; larger screens only the shop bar (and only where there is one)
    const hideClass  = phone.matches ? 'nav-hidden' : 'bar-hidden';
    const otherClass = phone.matches ? 'bar-hidden' : 'nav-hidden';
    root.classList.remove(otherClass);
    if (!phone.matches && !shopBar) { lastY = y; return; }

    // The page is frozen while the mobile chat sheet is open: ignore those jumps
    if (root.classList.contains('chat-open')) { lastY = y; return; }

    const delta = y - lastY;
    if (!canHide(y) || menuOpen()) {
      root.classList.remove(hideClass);
    } else if (delta > MIN_DELTA) {
      root.classList.add(hideClass);
    } else if (delta < -MIN_DELTA) {
      root.classList.remove(hideClass);
    }
    if (Math.abs(delta) > MIN_DELTA) lastY = y;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  window.addEventListener('resize', () => { measureBar(); update(); }, { passive: true });
  measureBar();
})();
