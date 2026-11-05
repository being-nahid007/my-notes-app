(() => {
  'use strict';

  const NOTES_KEY = 'notes.v1';
  const SETTINGS_KEY = 'notes.settings.v1';
  const $ = (s) => document.querySelector(s);

  const el = {
    list: $('#list'), search: $('#search'), status: $('#status'), toast: $('#toast'),
    btnNew: $('#btnNew'), btnSettings: $('#btnSettings'),
    editor: $('#editor'), btnBack: $('#btnBack'), btnPin: $('#btnPin'), btnDelete: $('#btnDelete'),
    title: $('#title'), body: $('#body'),
    settings: $('#settings'), btnSettingsBack: $('#btnSettingsBack'), btnSaveSettings: $('#btnSaveSettings'),
    server: $('#server'), apiKey: $('#apiKey'),
  };

  // ---------- storage ----------
  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function clean(n) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id) return null;
    return {
      id: n.id,
      title: typeof n.title === 'string' ? n.title : '',
      body: typeof n.body === 'string' ? n.body : '',
      pinned: n.pinned === true,
      deleted: n.deleted === true,
      updatedAt: Number(n.updatedAt) || 0,
    };
  }

  let notes = (() => {
    const raw = readJSON(NOTES_KEY, []);
    return Array.isArray(raw) ? raw.map(clean).filter(Boolean) : [];
  })();
  let settings = Object.assign({ server: '', apiKey: '' }, readJSON(SETTINGS_KEY, {}));
  let query = '';
  let draft = null; // note being edited: { id, title, body, pinned, isNew }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (e) {
      toast('Phone storage is full. Your latest change was not saved.');
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- UI helpers ----------
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2800);
  }

  function setStatus(text) { el.status.textContent = text; }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  function visibleNotes() {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => !n.deleted && (!q || (n.title + '\n' + n.body).toLowerCase().includes(q)))
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));
  }

  function render() {
    const items = visibleNotes();
    el.list.textContent = '';
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = query.trim() ? 'No notes match your search.' : 'No notes yet. Tap “New note” to write your first one.';
      el.list.appendChild(p);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const n of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card' + (n.pinned ? ' pinned' : '');
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = n.title.trim() || n.body.trim().split('\n')[0].slice(0, 60) || 'Untitled';
      const p = document.createElement('span');
      p.className = 'p';
      p.textContent = n.title.trim() ? n.body.trim().slice(0, 240) : n.body.trim().split('\n').slice(1).join('\n').slice(0, 240);
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = formatDate(n.updatedAt);
      card.append(t, p, d);
      card.addEventListener('click', () => openEditor(n.id));
      frag.appendChild(card);
    }
    el.list.appendChild(frag);
  }

  // ---------- editor ----------
  function openEditor(id) {
    const existing = id ? notes.find((n) => n.id === id && !n.deleted) : null;
    draft = existing
      ? { id: existing.id, title: existing.title, body: existing.body, pinned: existing.pinned, isNew: false }
      : { id: uid(), title: '', body: '', pinned: false, isNew: true };
    el.title.value = draft.title;
    el.body.value = draft.body;
    updatePinButton();
    el.editor.hidden = false;
    history.pushState({ sheet: 'editor' }, '');
    if (draft.isNew) el.title.focus();
  }

  function updatePinButton() {
    el.btnPin.setAttribute('aria-pressed', String(draft.pinned));
    el.btnPin.textContent = draft.pinned ? 'Pinned' : 'Pin';
  }

  function commitDraft() {
    if (!draft) return;
    const d = draft;
    draft = null;
    const title = el.title.value;
    const body = el.body.value;
    const idx = notes.findIndex((n) => n.id === d.id);
    const isEmpty = !title.trim() && !body.trim();

    if (isEmpty) {
      if (idx >= 0 && !notes[idx].deleted) {
        notes[idx] = Object.assign({}, notes[idx], { title: '', body: '', deleted: true, updatedAt: Date.now() });
      } else {
        return; // empty new note: discard
      }
    } else if (idx >= 0) {
      const old = notes[idx];
      if (old.title === title && old.body === body && old.pinned === d.pinned) return; // nothing changed
      notes[idx] = Object.assign({}, old, { title, body, pinned: d.pinned, deleted: false, updatedAt: Date.now() });
    } else {
      notes.push({ id: d.id, title, body, pinned: d.pinned, deleted: false, updatedAt: Date.now() });
    }
    saveNotes();
    render();
    scheduleSync();
  }

  function closeSheetsFromHistory() {
    if (!el.editor.hidden) {
      commitDraft();
      el.editor.hidden = true;
    }
    if (!el.settings.hidden) el.settings.hidden = true;
  }

  function goBack() {
    if (history.state && history.state.sheet) history.back();
    else closeSheetsFromHistory();
  }

  window.addEventListener('popstate', closeSheetsFromHistory);
  el.btnBack.addEventListener('click', goBack);
  el.btnSettingsBack.addEventListener('click', goBack);
  el.btnNew.addEventListener('click', () => openEditor(null));
  el.search.addEventListener('input', () => { query = el.search.value; render(); });

  el.btnPin.addEventListener('click', () => {
    if (!draft) return;
    draft.pinned = !draft.pinned;
    updatePinButton();
  });

  el.btnDelete.addEventListener('click', () => {
    if (!draft) return;
    if (!window.confirm('Delete this note?')) return;
    const id = draft.id;
    draft = null;
    const idx = notes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      notes[idx] = Object.assign({}, notes[idx], { title: '', body: '', deleted: true, updatedAt: Date.now() });
      saveNotes();
      scheduleSync();
    }
    render();
    goBack();
    toast('Note deleted');
  });

  // ---------- settings ----------
  el.btnSettings.addEventListener('click', () => {
    el.server.value = settings.server;
    el.apiKey.value = settings.apiKey;
    el.settings.hidden = false;
    history.pushState({ sheet: 'settings' }, '');
  });

  el.btnSaveSettings.addEventListener('click', () => {
    const server = el.server.value.trim().replace(/\/+$/, '');
    if (server && !/^https?:\/\/.+/i.test(server)) {
      toast('Server address must start with http:// or https://');
      return;
    }
    settings = { server, apiKey: el.apiKey.value.trim() };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      toast('Could not save settings');
      return;
    }
    goBack();
    if (server) sync(true);
    else { setStatus('Saved on this phone'); toast('Sync turned off'); }
  });

  // ---------- sync ----------
  let syncTimer = null;
  let syncing = false;
  let syncAgain = false;

  function scheduleSync() {
    if (!settings.server) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync(false), 2500);
  }

  function mergeRemote(remote) {
    const map = new Map(notes.map((n) => [n.id, n]));
    for (const r of remote) {
      const n = clean(r);
      if (!n || !n.updatedAt) continue;
      const local = map.get(n.id);
      if (!local || n.updatedAt > local.updatedAt) map.set(n.id, n);
    }
    notes = [...map.values()];
  }

  async function sync(manual) {
    if (!settings.server) {
      if (manual) toast('Add a server address in Settings first');
      return false;
    }
    if (syncing) { syncAgain = true; return false; }
    syncing = true;
    setStatus('Syncing…');
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (settings.apiKey) headers['x-api-key'] = settings.apiKey;
      const res = await fetch(settings.server + '/api/sync', {
        method: 'POST', headers, body: JSON.stringify({ notes }), signal: ctrl.signal,
      });
      if (res.status === 401) throw new Error('Wrong API key');
      if (!res.ok) throw new Error('Server error (' + res.status + ')');
      const data = await res.json();
      if (!data || !Array.isArray(data.notes)) throw new Error('Unexpected reply from server');
      mergeRemote(data.notes);
      saveNotes();
      render();
      setStatus('Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (manual) toast('Synced');
      return true;
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Server did not respond'
        : (e instanceof TypeError ? 'Cannot reach the server' : e.message);
      setStatus('Not synced');
      if (manual) toast(msg);
      return false;
    } finally {
      clearTimeout(timeout);
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }

  window.addEventListener('online', scheduleSync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });

  // ---------- start ----------
  setStatus(settings.server ? '' : 'Saved on this phone');
  render();
  if (settings.server) sync(false);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
