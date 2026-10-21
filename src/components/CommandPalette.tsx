import { useState, useEffect, useRef, useMemo } from 'preact/hooks';

interface SearchItem {
  type: 'page' | 'post' | 'action';
  title: string;
  description?: string;
  url?: string;
  keywords?: string;
  date?: string;
  action?: () => void;
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Default core actions
  const defaultActions: SearchItem[] = useMemo(
    () => [
      {
        type: 'action',
        title: 'Toggle Theme',
        description: 'Switch between light and dark mode',
        keywords: 'theme dark light mode toggle',
        action: () => {
          const isDark = document.documentElement.classList.toggle('dark');
          try {
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
          } catch {}
          setIsOpen(false);
        },
      },
      {
        type: 'action',
        title: copied ? 'URL Copied!' : 'Copy Current URL',
        description: 'Copy page link to clipboard',
        keywords: 'copy url link share clipboard',
        action: async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => {
              setCopied(false);
              setIsOpen(false);
            }, 800);
          } catch {}
        },
      },
      {
        type: 'page',
        title: 'Tag: #devops',
        description: 'Filter posts tagged with #devops',
        url: '/blog?tag=devops',
        keywords: 'tag devops infrastructure docker',
      },
      {
        type: 'page',
        title: 'Tag: #k3s',
        description: 'Filter posts tagged with #k3s',
        url: '/blog?tag=k3s',
        keywords: 'tag k3s kubernetes cluster',
      },
      {
        type: 'page',
        title: 'Tag: #cloudflare',
        description: 'Filter posts tagged with #cloudflare',
        url: '/blog?tag=cloudflare',
        keywords: 'tag cloudflare workers d1 r2 edge',
      },
    ],
    [copied]
  );

  // Fetch search items from API on open
  useEffect(() => {
    if (!isOpen || searchItems.length > 0) return;
    setIsLoading(true);
    fetch('/api/search.json')
      .then((res) => (res.ok ? (res.json() as Promise<SearchItem[]>) : Promise.resolve([])))
      .then((data: SearchItem[]) => {
        setSearchItems(data);
      })
      .catch((err) => {
        console.error('[Command Palette] Failed to load search index:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  // Global keyboard shortcuts (Cmd+K / Ctrl+K and custom event)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            lastFocusedRef.current = document.activeElement as HTMLElement | null;
          }
          return !prev;
        });
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      setIsOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleCustomOpen);
    };
  }, [isOpen]);

  // Focus input on open, and restore focus on close
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (lastFocusedRef.current) {
      lastFocusedRef.current.focus();
    }
  }, [isOpen]);

  // Combined & filtered items
  const filteredItems = useMemo(() => {
    const all = [...defaultActions, ...searchItems];
    const q = query.trim().toLowerCase();
    if (!q) return all;

    return all.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchKeywords;
    });
  }, [query, searchItems, defaultActions]);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation within list & focus trap
  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault(); // Trap focus inside search input
      return;
    }

    if (filteredItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        if (selected.action) {
          selected.action();
        } else if (selected.url) {
          window.location.href = selected.url;
          setIsOpen(false);
        }
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const activeItemId = filteredItems[selectedIndex]
    ? `palette-option-${selectedIndex}`
    : undefined;

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-neutral-950/50 backdrop-blur-xs transition-opacity duration-150 animate-in fade-in"
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        class="w-full max-w-lg rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 shadow-2xl backdrop-blur-md overflow-hidden text-neutral-900 dark:text-neutral-100 flex flex-col max-h-[75vh]"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div class="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <svg
            class="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="command-palette-results"
            aria-autocomplete="list"
            aria-activedescendant={activeItemId}
            value={query}
            onInput={(e: Event) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, posts, or commands..."
            class="w-full bg-transparent text-sm font-sans placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none text-neutral-900 dark:text-neutral-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              class="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
              aria-label="Clear query"
            >
              Clear
            </button>
          )}
          <span class="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          aria-label="Search suggestions"
          class="flex-1 overflow-y-auto p-2 space-y-1"
        >
          {isLoading && searchItems.length === 0 ? (
            <div class="py-10 text-center text-xs font-mono text-neutral-400 dark:text-neutral-500">
              Loading search index...
            </div>
          ) : filteredItems.length === 0 ? (
            <div class="py-10 text-center text-xs font-mono text-neutral-400 dark:text-neutral-500">
              No results found for "{query}"
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const prevType = index > 0 ? filteredItems[index - 1].type : null;
              const showGroupHeader = item.type !== prevType;
              const groupLabel =
                item.type === 'action'
                  ? 'Quick Actions'
                  : item.type === 'post'
                    ? 'Articles & Posts'
                    : 'Navigation & Pages';

              return (
                <div key={`${item.type}-${item.title}-${index}`}>
                  {showGroupHeader && (
                    <div class="px-3 pt-2.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-semibold select-none">
                      {groupLabel}
                    </div>
                  )}
                  <div
                    id={`palette-option-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      } else if (item.url) {
                        window.location.href = item.url;
                        setIsOpen(false);
                      }
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    class={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-xs font-sans ${
                      isSelected
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-l-2 border-emerald-500'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                  <div class="flex items-center gap-2.5 truncate">
                    <span
                      class={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0 ${
                        item.type === 'action'
                          ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300'
                          : item.type === 'post'
                            ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {item.type}
                    </span>
                    <div class="truncate">
                      <div class="font-medium truncate text-neutral-900 dark:text-neutral-100">
                        {item.title}
                      </div>
                      {item.description && (
                        <div class="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                    {item.date && <span>{item.date}</span>}
                    {isSelected && <span class="text-emerald-600 dark:text-emerald-400">&crarr;</span>}
                  </div>
                </div>
              </div>
            );
          })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div class="px-4 py-2 border-t border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
          <div class="flex items-center gap-3">
            <span>
              <kbd class="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                &uarr;
              </kbd>{' '}
              <kbd class="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                &darr;
              </kbd>{' '}
              navigate
            </span>
            <span>
              <kbd class="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                &crarr;
              </kbd>{' '}
              select
            </span>
          </div>
          <span>
            <kbd class="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
              ESC
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
