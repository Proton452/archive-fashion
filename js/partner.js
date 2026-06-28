(function () {
  const WHITELIST = ['FOOTBALL'];

  const pathCode = window.location.pathname.split('/').filter(Boolean)[0] || '';
  let activeCode = null;

  if (WHITELIST.includes(pathCode)) {
    activeCode = pathCode;
    sessionStorage.setItem('partnerCode', pathCode);
  } else {
    const stored = sessionStorage.getItem('partnerCode');
    if (stored && WHITELIST.includes(stored)) activeCode = stored;
  }

  window.PARTNER_CODE = activeCode;

  if (activeCode) {
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('a[href*="invite_code="]').forEach(function (link) {
        link.href = link.href.replace(/invite_code=[^&\s]+/, 'invite_code=' + activeCode);
      });
    });
  }
})();
