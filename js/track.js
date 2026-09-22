document.getElementById('trackForm')?.addEventListener('submit', function (e) {
  e.preventDefault();
  const input = document.getElementById('trackInput');
  const num = input.value.trim();
  if (!num) return;
  window.open('https://t.17track.net/en#nums=' + encodeURIComponent(num), '_blank', 'noopener');
});
