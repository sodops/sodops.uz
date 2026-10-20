export interface SearchIndexItem {
  type: 'page' | 'post';
  title: string;
  description: string;
  url: string;
  keywords: string;
  date?: string;
}

export function buildSearchIndex(publishedPosts: any[]): SearchIndexItem[] {
  // Strictly filter: only posts with published === 1 or explicit published flag
  const validPosts = (publishedPosts || []).filter(
    (p) => p && (p.published === 1 || p.published === true || (p.published === undefined && !p.draft))
  );

  return [
    // Standard Pages
    {
      type: 'page',
      title: 'Home',
      description: 'Personal site, bio, and latest updates',
      url: '/',
      keywords: 'home index bio sodiq about',
    },
    {
      type: 'page',
      title: 'Blog',
      description: 'Essays, engineering notes, and tutorials',
      url: '/blog',
      keywords: 'blog posts articles notes writing',
    },
    {
      type: 'page',
      title: 'Projects & Status',
      description: 'Active projects with real-time edge telemetry',
      url: '/projects',
      keywords: 'projects status uptime monitoring minecraft telemetry homelab',
    },
    {
      type: 'page',
      title: 'Uses',
      description: 'Tools, software, hardware, and dev environment',
      url: '/uses',
      keywords: 'uses tools setup gear linux k3s neovim hardware software',
    },
    {
      type: 'page',
      title: 'Now',
      description: 'What I am currently focusing on and building',
      url: '/now',
      keywords: 'now focus current activity studying devops ai',
    },
    // Published Posts Only
    ...validPosts.map((post) => ({
      type: 'post' as const,
      title: post.title,
      description: post.excerpt || '',
      url: `/blog/${post.slug}`,
      keywords: `${post.title} ${post.excerpt || ''} ${(post.tags || []).join(' ')}`,
      date: post.published_at ? post.published_at.split('T')[0] : undefined,
    })),
  ];
}
