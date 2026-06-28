(function () {
  var WHITELIST = ['football'];

  // Extract partner code from any position in the path
  var parts = window.location.pathname.split('/').filter(Boolean);
  var code = null;
  for (var i = 0; i < parts.length; i++) {
    if (WHITELIST.indexOf(parts[i].toLowerCase()) !== -1) { code = parts[i].toLowerCase(); break; }
  }

  if (code) {
    sessionStorage.setItem('partnerCode', code);
  } else {
    var stored = sessionStorage.getItem('partnerCode');
    if (stored && WHITELIST.indexOf(stored) !== -1) code = stored;
  }

  window.PARTNER_CODE = code;

  document.addEventListener('DOMContentLoaded', function () {
    var c = code ? '/' + code : '';

    // Rewrite nav links: clean URLs + partner code
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

    // Replace invite_code in signup CTAs
    if (code) {
      document.querySelectorAll('a[href*="invite_code="]').forEach(function (link) {
        link.href = link.href.replace(/invite_code=[^&\s]+/, 'invite_code=' + code);
      });
    }
  });
})();
