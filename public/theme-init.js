(function () {
  function applyTheme() {
    try {
      var stored = localStorage.getItem('theme');
      var isDark =
        stored === 'dark' ||
        (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {
      // LocalStorage or matchMedia may be restricted in sandboxes
    }
  }

  applyTheme();
  document.addEventListener('astro:after-swap', applyTheme);
})();
