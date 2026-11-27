/**
 * Public GitHub repositories shown in the "Open source" section of /projects.
 *
 * These are code projects, not monitored services, so they live here instead of
 * the D1 `projects` table (which drives the cron uptime checks). Descriptions are
 * taken from each repository's own README; do not add claims the repo doesn't make.
 */
export interface OpenSourceProject {
  /** Repository name under github.com/sodops */
  repo: string;
  /** Display name (the README title when it differs from the repo name) */
  name: string;
  description: string;
  tags: string[];
}

export const GITHUB_USER = 'sodops';

export const OPEN_SOURCE_PROJECTS: OpenSourceProject[] = [
  {
    repo: 'AI-Home',
    name: 'AI HOME',
    description:
      'Self-hosted monitoring stack for a cloud server: Prometheus, Grafana, Loki, Alertmanager and exporters, plus a local Python anomaly monitor with rule-based recommendations.',
    tags: ['Prometheus', 'Grafana', 'Loki', 'Docker Compose', 'Python'],
  },
  {
    repo: 'anki-formatter',
    name: 'AnkiFlow',
    description:
      'Flashcard learning platform built around the SM-2 spaced repetition algorithm, with Supabase authentication and cloud sync across devices.',
    tags: ['Next.js', 'TypeScript', 'Supabase', 'PostgreSQL'],
  },
  {
    repo: 'wallctl',
    name: 'wallctl',
    description:
      'Live video wallpapers for the niri Wayland compositor: a GTK4 / libadwaita app with tray icon, battery-aware playback and a Steam Workshop browser.',
    tags: ['Bash', 'Python', 'GTK4', 'Wayland'],
  },
  {
    repo: 'nix-flake-gnome',
    name: 'NixOS configuration',
    description:
      'Modular, reproducible NixOS setup managed with Nix Flakes and Home Manager: GNOME desktop, Zsh with Starship, ZRAM swap and automatic garbage collection.',
    tags: ['Nix', 'NixOS', 'Home Manager'],
  },
  {
    repo: 'nm2vbot',
    name: 'Audio to Voice Bot',
    description:
      'Telegram bot that converts MP3, WAV and M4A files into voice messages with FFmpeg, trims files longer than 60 seconds and keeps user statistics in MongoDB.',
    tags: ['TypeScript', 'Node.js', 'MongoDB', 'FFmpeg', 'Docker'],
  },
  {
    repo: 'wpe',
    name: 'WPE',
    description:
      'Command-line manager for linux-wallpaperengine with favorites, history, presets, performance stats and systemd autostart.',
    tags: ['Bash', 'systemd', 'Linux'],
  },
  {
    repo: 'talim',
    name: 'EduSpace',
    description:
      'Online learning platform: course catalog, YouTube-based video lessons, quizzes and a PDF certificate for passing with 80% or more.',
    tags: ['React', 'Vite', 'Tailwind CSS', 'Zustand'],
  },
];

export function repoUrl(project: Pick<OpenSourceProject, 'repo'>): string {
  return `https://github.com/${GITHUB_USER}/${project.repo}`;
}
