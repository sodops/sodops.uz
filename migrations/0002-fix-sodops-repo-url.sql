-- The sodops.uz project's "Source" link pointed to a non-existent repository
-- (github.com/skarimjonoff/sodops.uz returns 404). The code lives at github.com/sodops/sodops.uz.
-- Apply: pnpm exec wrangler d1 execute sodops-db --remote --file migrations/0002-fix-sodops-repo-url.sql
UPDATE projects
SET repo_url = 'https://github.com/sodops/sodops.uz'
WHERE id = 'proj_sodops_uz';
