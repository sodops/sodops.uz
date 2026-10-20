# sodops.uz Pre-Launch & Manual QA Checklist

This checklist is curated specifically for **Sodiq**. It covers verifications that require physical devices, biometric/touch interaction, personal Cloudflare Access credentials, or external third-party services that cannot be automated in local CI/sandbox environments.

---

## 1. Physical Device & Browser Verification

Automated Chromium and Firefox tests passed 100%, but real mobile devices exhibit subtle differences in touch gestures, virtual keyboards, and GPU rasterization.

### A. Apple iOS (Mobile Safari - WebKit Engine)
*Playwright WebKit was blocked on the Linux CI runner due to missing OS libraries. Physical verification on iOS is required.*

- [ ] **Viewport & Layout Integrity**:
  - Open `https://sodops.uz` on an iPhone (iOS 16+ Safari).
  - Rotate portrait to landscape and back: verify no horizontal overflow or page jitter.
  - Verify Safe Area insets: content does not collide with the Dynamic Island / Notch at the top, or the Home Indicator bar at the bottom.
- [ ] **Sticky Header & Backdrop Blur**:
  - Scroll down the homepage and blog pages.
  - Verify the header stays fixed at the top with a subtle backdrop blur (`backdrop-blur-md`).
- [ ] **Command Palette (`⌘K`) on iOS**:
  - Tap the `⌘K` button in the header.
  - Verify the modal overlay opens smoothly and centers on the screen.
  - Verify the iOS virtual keyboard appears without pushing the modal out of the viewport.
  - Tap the backdrop outside the modal or tap the close button: verify modal closes and keyboard dismisses.
- [ ] **Blog Post Interactive Features**:
  - Open `/blog/astro-cloudflare-d1-r2`.
  - Scroll down: observe the reading progress bar at the very top of the window filling smoothly.
  - Tap a heading link in the Table of Contents: verify smooth scrolling to the target anchor without hiding the heading behind the sticky header.
  - Tap the "Copy" button on a code snippet: verify the button transitions to "Copied!" and returns to the clipboard icon after 2 seconds.
- [ ] **Dark / Light Theme Toggle**:
  - Tap the theme toggle button in the header or via Command Palette.
  - Verify instantaneous color transitions without white flash (FOUC).
  - Refresh the page: verify theme persists from `localStorage`.

### B. Google Android (Mobile Chrome)
- [ ] **Address Bar Retraction**:
  - Scroll down `/blog` on Android Chrome: verify the browser address bar collapses smoothly without layout shifts.
- [ ] **Tap Target Responsiveness**:
  - Verify buttons, navigation links, and tag chips have comfortable touch target spacing (>= 44x44px).
  - Verify active tap states feel responsive with no noticeable tap delay.

---

## 2. Screen Reader Accessibility (VoiceOver & TalkBack)

WCAG 2.1 AA automated audits passed with Axe-core (0 violations). Validate the real auditory user experience.

### A. macOS / iOS VoiceOver (`Cmd + F5` or Triple-click Side Button)
- [ ] **Skip Link Navigation**:
  - Load `https://sodops.uz`.
  - Press `Tab` immediately: VoiceOver should focus and announce *"Skip to main content, link"*.
  - Press `Enter`: focus must jump directly to `<main id="main-content">`, skipping the header nav.
- [ ] **Command Palette Trigger (WCAG 2.5.3 Label-in-Name)**:
  - Navigate to the search trigger in the header.
  - VoiceOver must announce: *"⌘K - Open command palette, button"*.
  - Activate the button (`Space` or double-tap): focus must move directly into the search input.
  - Press `Down Arrow`: VoiceOver announces search results with selected state (`aria-selected="true"`).
  - Press `Esc`: modal closes and focus returns cleanly to the `⌘K` trigger button.
- [ ] **Status Indicator Semantics**:
  - Navigate to `/projects`.
  - Inspect project status badges: VoiceOver should announce the status text (*"Operational"*, *"Degraded"*, or *"Paused"*), not just an empty colored dot.

### B. Android TalkBack
- [ ] **Landmark Navigation**:
  - Swipe right through the page: confirm landmarks (`banner`, `navigation`, `main`, `contentinfo`) are clearly announced.

---

## 3. Cloudflare Zero Trust Access Flow

The admin path `/admin` and API routes `/api/admin/*` are strictly guarded. Test the real end-to-end authentication flow.

- [ ] **Zero Trust Challenge (Unauthenticated)**:
  - Open an Incognito / Private window.
  - Navigate to `https://sodops.uz/admin`.
  - **Expected**: Instant HTTP 302 redirect to your Cloudflare Zero Trust login page (`<team-name>.cloudflareaccess.com`).
- [ ] **OTP Authentication**:
  - Enter your authorized email address configured in `ADMIN_EMAILS`.
  - Retrieve the 6-digit PIN from your inbox and enter it.
  - **Expected**: Successful redirect back to `https://sodops.uz/admin`.
  - Inspect developer tools Cookies: `CF_Authorization` cookie must be present with `HttpOnly; Secure; SameSite=Lax`.
- [ ] **Admin Dashboard Verification**:
  - Verify the Post Editor loads.
  - Create a new draft post and save it: confirm no 401 or CSRF errors occur.
  - Navigate to status checks and cache purge controls: verify actions execute cleanly.
- [ ] **Unauthorized Rejection**:
  - Try logging in with an email NOT present in `ADMIN_EMAILS`.
  - **Expected**: Cloudflare Access denies access, or the application renders a clean 401 Unauthorized page (with no internal error leakage).

---

## 4. Social Share & Open Graph (OG) Previews

Validate how links preview when shared with clients and friends.

- [ ] **Telegram Messenger**:
  - Send `https://sodops.uz` to Telegram Saved Messages.
  - Verify the link preview card:
    - **Title**: Sodiq | Systems & Software Engineer
    - **Description**: Personal portfolio and technical blog.
    - **Image**: Renders `og.png` cleanly (1200x630) with proper contrast and aspect ratio.
  - Send `https://sodops.uz/blog/astro-cloudflare-d1-r2` to verify per-post preview.
- [ ] **Twitter / X & LinkedIn**:
  - Test `https://sodops.uz` in the Twitter Card Validator or compose window:
    - Card type: `summary_large_image`.
    - Image loads without timeout or CORS errors.

---

## 5. Webmaster Tools & Verification

- [ ] **Google Search Console**:
  - Add domain property `sodops.uz` in Google Search Console via Cloudflare DNS TXT record.
  - While `SITE_INDEXING=off`, confirm Search Console reports pages as blocked by `robots.txt` / `noindex` (this is the expected pre-launch state).
- [ ] **Cloudflare Web Analytics**:
  - Verify the Cloudflare Web Analytics beacon is active in production (`sodops.uz`).
  - Verify privacy-preserving metrics appear in your Cloudflare dashboard without requiring cookies.

---

## 6. Official Launch Sequence: Enabling Search Indexing

Once you have replaced all `TODO(sodiq)` placeholders with your personal copy and are ready for public discovery:

- [ ] **Step 1: Check Remaining TODOs**:
  ```bash
  pnpm todos
  ```
  Ensure all personal facts in `src/pages/uses.astro`, `src/pages/now.astro`, and `public/.well-known/security.txt` are finalized.

- [ ] **Step 2: Enable Indexing in Configuration**:
  Edit `wrangler.jsonc` and switch `SITE_INDEXING` to `"on"`:
  ```jsonc
  "vars": {
    "SITE_INDEXING": "on"
  }
  ```

- [ ] **Step 3: Merge & Deploy**:
  ```bash
  git checkout main
  git merge qa-pass
  git push origin main
  ```
  *(Or trigger production deployment via your GitHub Actions CI/CD pipeline).*

- [ ] **Step 4: Verify Live Production Headers**:
  Run the automated production check:
  ```bash
  pnpm qa:prod
  ```
  And verify headers with `curl`:
  ```bash
  curl -sI https://sodops.uz | grep -i x-robots-tag
  curl -s https://sodops.uz/robots.txt
  ```
  **Expected**:
  - `robots.txt` output shows `Allow: /` and advertises `Sitemap: https://sodops.uz/sitemap-index.xml`.
  - No `X-Robots-Tag: noindex` header is sent to crawlers.

- [ ] **Step 5: Submit Sitemap to Search Engines**:
  - In Google Search Console: submit `https://sodops.uz/sitemap-index.xml`.
  - In Bing Webmaster Tools: submit `https://sodops.uz/sitemap-index.xml`.
