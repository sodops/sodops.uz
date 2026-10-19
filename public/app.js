(function () {
  // 1. Theme toggle
  function setupThemeToggle() {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', function () {
      var isDark = document.documentElement.classList.toggle('dark');
      try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      } catch (e) {}
    });
  }

  // 2. Obfuscated email link decoder
  function setupEmail() {
    var emailLink = document.getElementById('contact-email');
    if (!emailLink || emailLink.dataset.bound) return;
    emailLink.dataset.bound = 'true';
    var user = emailLink.getAttribute('data-user');
    var domain = emailLink.getAttribute('data-domain');
    if (user && domain) {
      var email = user + '@' + domain;
      emailLink.setAttribute('href', 'mailto:' + email);
      emailLink.textContent = email;
    }
  }

  // 3. Blog post share and code block copy buttons
  function setupBlogInteractions() {
    var shareBtn = document.getElementById('share-btn');
    var shareText = document.getElementById('share-text');
    if (shareBtn && shareText && !shareBtn.dataset.bound) {
      shareBtn.dataset.bound = 'true';
      shareBtn.addEventListener('click', async function () {
        try {
          await navigator.clipboard.writeText(window.location.href);
          var orig = shareText.textContent;
          shareText.textContent = 'Link copied!';
          setTimeout(function () {
            shareText.textContent = orig;
          }, 2000);
        } catch (e) {}
      });
    }

    var blocks = document.querySelectorAll('pre');
    blocks.forEach(function (block) {
      if (block.querySelector('.code-copy-btn')) return;
      block.style.position = 'relative';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'code-copy-btn absolute top-2 right-2 px-2 py-1 text-[11px] font-mono rounded bg-neutral-200/80 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      block.addEventListener('mouseenter', function () {
        btn.style.opacity = '1';
      });
      block.addEventListener('mouseleave', function () {
        btn.style.opacity = '0';
      });

      btn.addEventListener('click', async function () {
        var code = block.querySelector('code');
        var textToCopy = code ? code.innerText : block.innerText;
        try {
          await navigator.clipboard.writeText(textToCopy);
          btn.textContent = 'Copied!';
          setTimeout(function () {
            btn.textContent = 'Copy';
          }, 2000);
        } catch (e) {}
      });

      block.appendChild(btn);
    });
  }

  // 4. Command palette trigger button
  function setupCommandPaletteTrigger() {
    var trigger = document.getElementById('cmd-k-trigger');
    if (!trigger || trigger.dataset.bound) return;
    trigger.dataset.bound = 'true';
    trigger.addEventListener('click', function () {
      window.dispatchEvent(new CustomEvent('open-command-palette'));
    });
  }

  function init() {
    setupThemeToggle();
    setupEmail();
    setupBlogInteractions();
    setupCommandPaletteTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('astro:page-load', init);
  document.addEventListener('astro:after-swap', init);
})();
