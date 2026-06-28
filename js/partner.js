(function () {
  var SHEET_ID = '1w2N8A0f_xnmU3O1l-tFTiaC3Kp6GyjVBpjVscvCDk8M';
  var CODES_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=Codes';
  var PAGE_NAMES = ['women', 'reviews', 'faq', 'how-to-order'];

  // Detect potential slug: first URL segment that isn't a known page
  var parts = window.location.pathname.split('/').filter(Boolean);
  var urlSlug = null;
  for (var i = 0; i < parts.length; i++) {
    if (PAGE_NAMES.indexOf(parts[i].toLowerCase()) === -1) {
      urlSlug = parts[i].toLowerCase();
      break;
    }
  }

  function parseCodes(csv) {
    var map = {};
    var rows = csv.trim().split('\n');
    for (var i = 1; i < rows.length; i++) {
      var cols = rows[i].split(',').map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
      if (cols[0] && cols[1]) map[cols[0].toLowerCase()] = cols[1];
    }
    return map;
  }

  window.partnerReady = fetch(CODES_URL)
    .then(function (r) { return r.text(); })
    .then(function (csv) {
      var codeMap = parseCodes(csv);
      var slug = null;

      if (urlSlug) {
        if (codeMap[urlSlug]) {
          slug = urlSlug;
          sessionStorage.setItem('partnerSlug', slug);
        } else {
          // Unknown path → clear session and go home
          sessionStorage.removeItem('partnerSlug');
          window.location.replace('/');
          return;
        }
      } else {
        var stored = sessionStorage.getItem('partnerSlug');
        if (stored && codeMap[stored]) slug = stored;
      }

      var inviteCode = slug ? codeMap[slug] : null;
      window.PARTNER_CODE = inviteCode;

      function applyRewrites() {
        var c = slug ? '/' + slug : '';
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

        // Brand logo always resets to default homepage
        document.querySelectorAll('.nav__brand, .footer__brand').forEach(function (el) {
          el.setAttribute('href', '/');
          el.addEventListener('click', function () {
            sessionStorage.removeItem('partnerSlug');
          });
        });

        if (inviteCode) {
          document.querySelectorAll('a[href*="invite_code="]').forEach(function (link) {
            link.href = link.href.replace(/invite_code=[^&\s]+/, 'invite_code=' + inviteCode);
          });
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyRewrites);
      } else {
        applyRewrites();
      }
    })
    .catch(function () {
      window.PARTNER_CODE = null;
    });
})();
