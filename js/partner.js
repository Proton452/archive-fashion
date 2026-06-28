(function () {
  var CODE_MAP = {
    'football': 'FOOTBALL'
  };

  // Extract partner code from any position in the path
  var parts = window.location.pathname.split('/').filter(Boolean);
  var slug = null;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].toLowerCase();
    if (CODE_MAP[p]) { slug = p; break; }
  }

  if (slug) {
    sessionStorage.setItem('partnerSlug', slug);
  } else {
    var stored = sessionStorage.getItem('partnerSlug');
    if (stored && CODE_MAP[stored]) slug = stored;
  }

  var inviteCode = slug ? CODE_MAP[slug] : null;
  window.PARTNER_CODE = inviteCode;

  document.addEventListener('DOMContentLoaded', function () {
    var c = slug ? '/' + slug : '';

    // Rewrite nav links: clean URLs + partner slug
    var map = {
      'index.html': c || '/',
      'women.html': '/women' + c,
      'reviews.html': '/reviews' + c,
      'how-to-order.html': '/how-to-order' + c,
      'faq.html': '/faq' + c
    };

    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (map[href] !== undefined) link.setAttribute('href', map[href]);
    });

    // Force brand links (navbar + footer logo) to keep partner code
    var home = c || '/';
    document.querySelectorAll('.nav__brand, .footer__brand').forEach(function (el) {
      el.setAttribute('href', home);
    });

    // Replace invite_code with the real Lovegobuy code
    if (inviteCode) {
      document.querySelectorAll('a[href*="invite_code="]').forEach(function (link) {
        link.href = link.href.replace(/invite_code=[^&\s]+/, 'invite_code=' + inviteCode);
      });
    }
  });
})();
