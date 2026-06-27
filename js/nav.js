/* Shared navbar + FAQ logic for secondary pages */

(function () {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('navBurger');
  const mobile = document.getElementById('navMobile');

  /* Nav link spring animation on click */
  document.querySelectorAll('.nav__link').forEach(function (link) {
    link.addEventListener('click', function () {
      this.classList.remove('is-pressed');
      void this.offsetWidth; /* reflow to restart */
      this.classList.add('is-pressed');
      this.addEventListener('animationend', function () {
        this.classList.remove('is-pressed');
      }, { once: true });
    });
  });

  /* Scrolled state */
  function onScroll() {
    nav.classList.toggle('is-scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Hamburger */
  function closeMenu() {
    burger.classList.remove('is-open');
    mobile.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    mobile.setAttribute('aria-hidden', 'true');
  }

  burger.addEventListener('click', function (e) {
    e.stopPropagation();
    const opening = !mobile.classList.contains('is-open');
    burger.classList.toggle('is-open', opening);
    mobile.classList.toggle('is-open', opening);
    burger.setAttribute('aria-expanded', String(opening));
    mobile.setAttribute('aria-hidden', String(!opening));
  });

  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target) && !mobile.contains(e.target)) closeMenu();
  });

  /* FAQ accordion (only runs if .faq-item elements exist) */
  document.querySelectorAll('.faq-item__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item   = btn.closest('.faq-item');
      const isOpen = item.classList.contains('is-open');

      document.querySelectorAll('.faq-item.is-open').forEach(function (el) {
        el.classList.remove('is-open');
        el.querySelector('.faq-item__q').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}());
