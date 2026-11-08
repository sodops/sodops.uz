/* Public-site editor. It does NOTHING unless ?edit=1 and Cloudflare Access
 * authorizes the /api/admin/content endpoint on the same origin.
 * All user text is assigned via textContent, never innerHTML. */
(function () {
  'use strict';
  var API = '/api/admin/content';
  var links = [
    ['Home', '/'], ['Blog', '/blog'], ['Projects', '/projects'],
    ['Uses', '/uses'], ['Now', '/now'],
  ];

  function element(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function notice(message) {
    var note = element('div', 'visual-editor-notice', message);
    document.body.appendChild(note);
    setTimeout(function () { note.remove(); }, 4500);
  }

  function showEditor(target, key, config, project) {
    var initial = target.textContent || '';
    var dialog = element('dialog', 'visual-editor-dialog');
    dialog.setAttribute('aria-label', 'Edit ' + key);

    var title = element('h2', '', 'Edit: ' + key.replace(/\./g, ' / '));
    var hint = element('p', '', 'Text only. Changes are saved to the site database immediately.');
    var textarea = element('textarea', 'visual-editor-textarea');
    textarea.value = initial;
    textarea.setAttribute('aria-label', 'New text for ' + key);
    textarea.maxLength = 4000;
    var message = element('p', 'visual-editor-message');
    message.setAttribute('aria-live', 'polite');

    var actions = element('div', 'visual-editor-actions');
    var cancel = element('button', '', 'Cancel');
    var reset = element('button', '', 'Restore default');
    if (project) reset.hidden = true;
    var save = element('button', 'visual-editor-primary', 'Save changes');
    for (var btn of [cancel, reset, save]) btn.type = 'button';
    actions.append(cancel, reset, save);
    dialog.append(title, hint, textarea, message, actions);
    document.body.appendChild(dialog);

    var close = function () {
      target.textContent = initial;
      dialog.close();
      dialog.remove();
    };
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', function () {
      target.textContent = initial;
      dialog.remove();
    });
    textarea.addEventListener('input', function () {
      target.textContent = textarea.value;
    });

    async function mutate(method, value) {
      message.textContent = 'Saving…';
      save.disabled = true;
      reset.disabled = true;
      cancel.disabled = true;
      try {
        var endpoint = project ? '/api/admin/projects/' + encodeURIComponent(project.id) : API;
        var payload = project ? { field: project.field, value: value }
          : method === 'DELETE' ? { key: key } : { key: key, value: value };
        var response = await fetch(endpoint, {
          method: method,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          var error = await response.json().catch(function () { return {}; });
          throw new Error(error.error || 'Save failed (' + response.status + ')');
        }
        var data = await response.json();
        if (!project) config.overrides[key] = method === 'DELETE' ? undefined : data.value;
        target.textContent = data.value;
        dialog.close();
        dialog.remove();
        notice('Saved: ' + key);
      } catch (error) {
        message.textContent = error.message || 'Unable to save.';
      } finally {
        save.disabled = false;
        reset.disabled = false;
        cancel.disabled = false;
      }
    }
    save.addEventListener('click', function () { void mutate('PUT', textarea.value); });
    reset.addEventListener('click', function () {
      if (window.confirm('Restore original text for ' + key + '?')) void mutate('DELETE');
    });

    dialog.showModal();
    textarea.focus();
    textarea.select();
  }

  async function start() {
    if (new URL(window.location.href).searchParams.get('edit') !== '1') return;
    if (document.getElementById('visual-editor-toolbar')) return;

    var response;
    try {
      response = await fetch(API, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error('Please sign in at /admin before editing this page.');
      }
    } catch (error) {
      notice(error.message || 'Visual edit mode requires admin authentication.');
      return;
    }

    var config = await response.json();
    var bar = element('nav', 'visual-editor-toolbar');
    bar.id = 'visual-editor-toolbar';
    bar.setAttribute('aria-label', 'Site content editing');
    bar.appendChild(element('strong', '', '✎ Edit mode'));
    links.forEach(function (pair) {
      var a = element('a', '', pair[0]);
      a.href = pair[1] + '?edit=1';
      bar.appendChild(a);
    });
    var posts = element('a', '', 'Manage posts');
    posts.href = '/admin';
    bar.appendChild(posts);
    var exit = element('a', 'visual-editor-exit', 'Exit editing');
    exit.href = window.location.pathname;
    bar.appendChild(exit);
    document.body.appendChild(bar);
    document.body.classList.add('visual-editor-active');

    document.querySelectorAll('[data-edit-key]').forEach(function (target) {
      var key = target.getAttribute('data-edit-key');
      if (!Object.prototype.hasOwnProperty.call(config.defaults, key)) return;
      if (target.nextElementSibling && target.nextElementSibling.classList.contains('visual-editor-pencil')) return;
      var button = element('button', 'visual-editor-pencil', '✎');
      button.type = 'button';
      button.setAttribute('aria-label', 'Edit ' + key);
      button.title = 'Edit ' + key;
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showEditor(target, key, config, null);
      });
      // Never nest an interactive pencil button inside an anchor.
      var link = target.closest('a');
      (link || target).after(button);
    });

    // D1 project cards use a separately guarded, field-allowlisted API.
    document.querySelectorAll('[data-project-id][data-project-field]').forEach(function (target) {
      var id = target.getAttribute('data-project-id');
      var field = target.getAttribute('data-project-field');
      if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !['name','description'].includes(field)) return;
      var button = element('button', 'visual-editor-pencil', '✎');
      button.type = 'button';
      button.setAttribute('aria-label', 'Edit project ' + field);
      button.title = 'Edit project ' + field;
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        showEditor(target, 'project / ' + id + ' / ' + field, config, {id: id, field: field});
      });
      (target.closest('a') || target).after(button);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else void start();
  document.addEventListener('astro:page-load', start);
})();
