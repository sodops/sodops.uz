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
    } catch (e) {}
  }

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

      // Language badge if code has language class
      var code = block.querySelector('code');
      if (code && code.className) {
        var match = code.className.match(/language-([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          var badge = document.createElement('span');
          badge.className =
            'code-lang-badge absolute top-2 right-14 text-[10px] font-mono uppercase text-neutral-400 select-none opacity-60';
          badge.textContent = match[1];
          badge.setAttribute('aria-hidden', 'true');
          block.appendChild(badge);
        }
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'code-copy-btn absolute top-2 right-2 px-2 py-1 text-[11px] font-mono rounded bg-neutral-200/80 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 opacity-0 hover:opacity-100 focus:opacity-100 transition-all cursor-pointer';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      block.addEventListener('mouseenter', function () {
        btn.style.opacity = '1';
      });
      block.addEventListener('mouseleave', function () {
        btn.style.opacity = '0';
      });

      btn.addEventListener('click', async function () {
        var textToCopy = code ? code.innerText : block.innerText;
        try {
          await navigator.clipboard.writeText(textToCopy);
          btn.textContent = 'Copied!';
          btn.classList.add('text-emerald-600', 'dark:text-emerald-400');
          setTimeout(function () {
            btn.textContent = 'Copy';
            btn.classList.remove('text-emerald-600', 'dark:text-emerald-400');
          }, 2000);
        } catch (e) {}
      });

      block.appendChild(btn);
    });
  }

  // 4. Reading progress bar & TOC active heading highlight
  function setupReadingProgressAndToc() {
    var progressBar = document.getElementById('reading-progress');
    var tocLinks = document.querySelectorAll('nav[aria-label="Table of contents"] a');

    if (progressBar) {
      function updateProgress() {
        var scrollTop = window.scrollY || document.documentElement.scrollTop;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        progressBar.style.width = Math.min(100, Math.max(0, progress)) + '%';
      }
      window.addEventListener('scroll', updateProgress, { passive: true });
      updateProgress();
    }

    if (tocLinks.length > 0 && 'IntersectionObserver' in window) {
      var headingIds = Array.from(tocLinks).map(function (link) {
        return link.getAttribute('href').replace('#', '');
      });
      var headings = headingIds
        .map(function (id) {
          return document.getElementById(id);
        })
        .filter(Boolean);

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var id = entry.target.id;
              tocLinks.forEach(function (link) {
                var isActive = link.getAttribute('href') === '#' + id;
                if (isActive) {
                  link.classList.add('text-emerald-600', 'dark:text-emerald-400', 'font-medium');
                  link.classList.remove('text-neutral-600', 'dark:text-neutral-400');
                } else {
                  link.classList.remove('text-emerald-600', 'dark:text-emerald-400', 'font-medium');
                  link.classList.add('text-neutral-600', 'dark:text-neutral-400');
                }
              });
            }
          });
        },
        { rootMargin: '-20% 0% -60% 0%' }
      );

      headings.forEach(function (h) {
        observer.observe(h);
      });
    }
  }

  // 5. Command palette trigger button
  function setupCommandPaletteTrigger() {
    var trigger = document.getElementById('cmd-k-trigger');
    if (!trigger || trigger.dataset.bound) return;
    trigger.dataset.bound = 'true';
    trigger.addEventListener('click', function () {
      window.dispatchEvent(new CustomEvent('open-command-palette'));
    });
  }

  function init() {
    applyTheme();
    setupThemeToggle();
    setupEmail();
    setupBlogInteractions();
    setupReadingProgressAndToc();
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
