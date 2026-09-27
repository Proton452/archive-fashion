/* Hide the top nav while scrolling down, bring it back on any scroll up.
   The sticky shop bar (tabs + search) then slides up to the top of the screen.
   Shared by every page. */

(function () {
  const root = document.documentElement;
  const nav  = document.getElementById('nav');
  if (!nav) return;

  const MIN_DELTA = 6;   // ignore tiny jitters
  let lastY = window.scrollY;
  let ticking = false;

  function menuOpen() {
    const menu = document.getElementById('navMobile');
    return menu && menu.classList.contains('is-open');
  }

  function update() {
    ticking = false;
    const y = window.scrollY;

    // The page is frozen while the mobile chat sheet is open: ignore those jumps
    if (root.classList.contains('chat-open')) { lastY = y; return; }

    const delta = y - lastY;
    if (y <= nav.offsetHeight * 2 || menuOpen()) {
      root.classList.remove('nav-hidden');
    } else if (delta > MIN_DELTA) {
      root.classList.add('nav-hidden');
    } else if (delta < -MIN_DELTA) {
      root.classList.remove('nav-hidden');
    }
    if (Math.abs(delta) > MIN_DELTA) lastY = y;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
})();
