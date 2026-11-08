(function () {
      if (!document.getElementById('admin-app')) return;
      const listView = document.getElementById('posts-list-view');
      const editorView = document.getElementById('post-editor-view');
      const newPostBtn = document.getElementById('new-post-btn');
      const cancelTop = document.getElementById('cancel-editor-btn');
      const cancelBottom = document.getElementById('cancel-btn-bottom');
      const postForm = document.getElementById('post-form');
      const heading = document.getElementById('editor-heading');
      const alertBox = document.getElementById('admin-alert');
      const deleteCurrentBtn = document.getElementById('delete-current-btn');

      const inputId = document.getElementById('post-id');
      const inputTitle = document.getElementById('post-title');
      const inputSlug = document.getElementById('post-slug');
      const inputExcerpt = document.getElementById('post-excerpt');
      const inputTags = document.getElementById('post-tags');
      const inputPublished = document.getElementById('post-published');
      const inputContent = document.getElementById('post-content');
      const previewPane = document.getElementById('post-preview');
      const uploadStatus = document.getElementById('upload-status');
      const wordCountBadge = document.getElementById('word-count-badge');
      const autosaveStatus = document.getElementById('autosave-status');

      let isDirty = false;
      const AUTOSAVE_KEY = 'sodops_admin_draft';
      let autosaveTimer = null;

      function slugify(input) {
        if (!input) return '';
        let str = input.trim().toLowerCase();
        // Uzbek typographic apostrophes: o‘, o', o’ -> o; g‘, g', g’ -> g
        str = str.replace(/o['‘`’]/g, 'o').replace(/g['‘`’]/g, 'g');
        const cyrillicMap = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j',
          'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
          'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts',
          'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
          'я': 'ya', 'ў': 'o', 'қ': 'q', 'ғ': 'g', 'ҳ': 'h',
        };
        str = str.split('').map((c) => cyrillicMap[c] || c).join('');
        return str
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function updateStats() {
        const text = inputContent.value.trim();
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        const minutes = Math.max(1, Math.ceil(words / 200));
        if (wordCountBadge) {
          wordCountBadge.textContent = `${words} words · ${minutes} min read`;
        }
      }

      function triggerAutosave() {
        isDirty = true;
        if (!inputId.value) {
          clearTimeout(autosaveTimer);
          autosaveTimer = setTimeout(() => {
            try {
              const draft = {
                title: inputTitle.value,
                slug: inputSlug.value,
                excerpt: inputExcerpt.value,
                tags: inputTags.value,
                content: inputContent.value,
                savedAt: Date.now(),
              };
              localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft));
              if (autosaveStatus) {
                autosaveStatus.textContent = 'Draft autosaved';
                setTimeout(() => {
                  if (autosaveStatus) autosaveStatus.textContent = '';
                }, 2000);
              }
            } catch {}
          }, 800);
        }
      }

      window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
          e.preventDefault();
        }
      });

      function showAlert(msg, isError = false) {
        alertBox.textContent = msg;
        alertBox.className = isError
          ? 'px-4 py-2 text-xs rounded border border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300 block'
          : 'px-4 py-2 text-xs rounded border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 block';
        setTimeout(() => {
          alertBox.className = 'hidden';
        }, 4000);
      }

      function showEditor(editMode = false, data = {}) {
        listView.classList.add('hidden');
        editorView.classList.remove('hidden');

        if (editMode) {
          heading.textContent = `Edit Post: ${data.title}`;
          inputId.value = data.id || '';
          inputTitle.value = data.title || '';
          inputSlug.value = data.slug || '';
          inputExcerpt.value = data.excerpt || '';
          inputTags.value = data.tags || '';
          inputPublished.checked = data.published === 'true' || data.published === true;
          inputContent.value = data.content || '';
          deleteCurrentBtn.classList.remove('hidden');
          isDirty = false;
        } else {
          heading.textContent = 'Create New Post';
          inputId.value = '';

          // Check for saved local draft
          let restored = false;
          try {
            const rawDraft = localStorage.getItem(AUTOSAVE_KEY);
            if (rawDraft) {
              const draft = JSON.parse(rawDraft);
              if (draft && (draft.title || draft.content)) {
                inputTitle.value = draft.title || '';
                inputSlug.value = draft.slug || '';
                inputExcerpt.value = draft.excerpt || '';
                inputTags.value = draft.tags || '';
                inputContent.value = draft.content || '';
                restored = true;
                showAlert('Restored unsaved draft from your browser.');
              }
            }
          } catch {}

          if (!restored) {
            inputTitle.value = '';
            inputSlug.value = '';
            inputExcerpt.value = '';
            inputTags.value = '';
            inputContent.value = '';
          }
          inputPublished.checked = false;
          deleteCurrentBtn.classList.add('hidden');
          isDirty = restored;
        }
        updatePreview();
        updateStats();
      }

      function showList() {
        if (isDirty && !confirm('You have unsaved changes. Are you sure you want to exit?')) {
          return;
        }
        isDirty = false;
        editorView.classList.add('hidden');
        listView.classList.remove('hidden');
      }

      // Auto-generate slug from title if empty
      inputTitle.addEventListener('input', () => {
        if (!inputId.value) {
          inputSlug.value = slugify(inputTitle.value);
        }
        triggerAutosave();
      });

      inputSlug.addEventListener('input', triggerAutosave);
      inputExcerpt.addEventListener('input', triggerAutosave);
      inputTags.addEventListener('input', triggerAutosave);

      // Live Preview
      function updatePreview() {
        const raw = inputContent.value;
        // Simple live render for instant client feedback
        const escaped = raw
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        previewPane.innerHTML = `<pre class="whitespace-pre-wrap font-mono text-xs">${escaped}</pre>`;
        updateStats();
      }
      inputContent.addEventListener('input', () => {
        updatePreview();
        triggerAutosave();
      });

      newPostBtn.addEventListener('click', () => showEditor(false));
      cancelTop.addEventListener('click', showList);
      cancelBottom.addEventListener('click', showList);

      // Edit button handler
      document.querySelectorAll('.edit-post-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          showEditor(true, {
            id,
            title: btn.dataset.title,
            slug: btn.dataset.slug,
            content: btn.dataset.content || '',
            excerpt: btn.dataset.excerpt,
            tags: btn.dataset.tags,
            published: btn.dataset.published,
          });

          // Fetch fresh canonical post data from API
          try {
            const res = await fetch(`/admin/api/posts/${id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.post && inputId.value === id) {
                inputTitle.value = data.post.title || '';
                inputSlug.value = data.post.slug || '';
                inputExcerpt.value = data.post.excerpt || '';
                inputTags.value = Array.isArray(data.post.tags) ? data.post.tags.join(', ') : '';
                inputPublished.checked = Boolean(data.post.published);
                inputContent.value = data.post.content || '';
                updatePreview();
              }
            }
          } catch {}
        });
      });

      // Delete button handler
      async function deletePostById(id, title) {
        if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
        try {
          const res = await fetch(`/admin/api/posts/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            let msg = 'Delete failed';
            try {
              const data = await res.json();
              if (data.error) msg = `Delete failed: ${data.error}`;
            } catch {
              msg = `Delete failed (HTTP ${res.status})`;
            }
            throw new Error(msg);
          }
          showAlert(`Post "${title}" deleted.`);
          setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
          showAlert(err.message, true);
        }
      }

      document.querySelectorAll('.delete-post-btn').forEach((btn) => {
        btn.addEventListener('click', () =>
          deletePostById(btn.dataset.id, btn.dataset.title)
        );
      });

      deleteCurrentBtn.addEventListener('click', () => {
        if (inputId.value) deletePostById(inputId.value, inputTitle.value);
      });

      // Form Submit: Save Post & Invalidate Edge Cache
      postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('save-post-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving & Purging CDN...';

        const contentStr = inputContent.value;
        const contentBytes = new TextEncoder().encode(contentStr).length;
        if (contentBytes > 64 * 1024) {
          showAlert(
            `Content exceeds the 64 KB limit (${Math.round(contentBytes / 1024)} KB submitted). Please shorten the post to prevent edge execution timeouts.`,
            true
          );
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Post';
          return;
        }

        const payload = {
          title: inputTitle.value,
          slug: inputSlug.value,
          content: contentStr,
          excerpt: inputExcerpt.value,
          tags: inputTags.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          published: inputPublished.checked ? 1 : 0,
        };

        const isEdit = Boolean(inputId.value);
        const url = isEdit ? `/admin/api/posts/${inputId.value}` : '/admin/api/posts';
        const method = isEdit ? 'PUT' : 'POST';

        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            let errMsg = 'Failed to save post';
            try {
              const errData = await res.json();
              errMsg = errData.error || errMsg;
            } catch {
              if (res.status === 413) {
                errMsg = 'Post content exceeds the 64 KB limit. Please shorten your post.';
              } else if (res.status === 524 || res.status === 504) {
                errMsg = 'Server timeout while saving post (Cloudflare CPU limit exceeded).';
              } else {
                errMsg = `Server error (HTTP ${res.status})`;
              }
            }
            throw new Error(errMsg);
          }

          isDirty = false;
          try {
            localStorage.removeItem(AUTOSAVE_KEY);
          } catch {}

          showAlert('Post saved successfully! Edge cache purged.');
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          showAlert(err.message, true);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Post';
        }
      });

      // Image Upload (Drag-and-Drop & Paste onto textarea)
      async function uploadImageFile(file) {
        uploadStatus.textContent = 'Uploading image to R2...';
        const form = new FormData();
        form.append('file', file);

        try {
          const res = await fetch('/admin/api/upload', {
            method: 'POST',
            body: form,
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Upload failed');
          }

          const data = await res.json();
          uploadStatus.textContent = 'Upload complete!';
          setTimeout(() => (uploadStatus.textContent = ''), 2500);

          // Insert markdown image tag at cursor position
          const imgMarkdown = `\n![${file.name}](${data.url})\n`;
          const start = inputContent.selectionStart;
          const end = inputContent.selectionEnd;
          const text = inputContent.value;
          inputContent.value = text.slice(0, start) + imgMarkdown + text.slice(end);
          updatePreview();
        } catch (err) {
          uploadStatus.textContent = `Error: ${err.message}`;
        }
      }

      inputContent.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              e.preventDefault();
              const file = item.getAsFile();
              if (file) uploadImageFile(file);
              return;
            }
          }
        }
      });

      inputContent.addEventListener('dragover', (e) => e.preventDefault());
      inputContent.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
          uploadImageFile(files[0]);
        }
      });
    })();

