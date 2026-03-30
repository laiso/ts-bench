/**
 * Client-side task list: load tasks.json, filter, and copy CLI snippet.
 * Zero build-time deps; keep search on question_id + title + description.
 * If this gets slow on large datasets, narrow the haystack to title + question_id only.
 */

(function () {
  'use strict';

  /** @typedef {{ question_id: string, variant: string, price: number, set: string, title: string, description: string }} Task */

  const searchEl = document.getElementById('search');
  const setEl = document.getElementById('filter-set');
  const variantEl = document.getElementById('filter-variant');
  const bodyEl = document.getElementById('task-body');
  const countEl = document.getElementById('result-count');
  const loadErrorEl = document.getElementById('load-error');

  /** @type {Task[]} */
  let allTasks = [];

  function cliTemplate(questionId) {
    return (
      'bun src/index.ts --dataset v2 --agent <YOUR_AGENT> --exercise ' +
      questionId
    );
  }

  function normalize(s) {
    return (s || '').toLowerCase();
  }

  function matchesSearch(task, q) {
    if (!q) return true;
    const n = normalize(q);
    return (
      normalize(task.question_id).includes(n) ||
      normalize(task.title).includes(n) ||
      normalize(task.description).includes(n)
    );
  }

  function filteredTasks() {
    const q = searchEl.value.trim();
    const setVal = setEl.value;
    const variantVal = variantEl.value;
    return allTasks.filter(t => {
      if (setVal && t.set !== setVal) return false;
      if (variantVal && t.variant !== variantVal) return false;
      return matchesSearch(t, q);
    });
  }

  function fillSelectOptions() {
    const sets = [...new Set(allTasks.map(t => t.set).filter(Boolean))].sort();
    const variants = [...new Set(allTasks.map(t => t.variant).filter(Boolean))].sort();
    for (const s of sets) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      setEl.appendChild(opt);
    }
    for (const v of variants) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      variantEl.appendChild(opt);
    }
  }

  const TITLE_MAX = 100;

  function truncateTitle(title) {
    if (title.length <= TITLE_MAX) return { short: title, full: false };
    return { short: title.slice(0, TITLE_MAX) + '…', full: true };
  }

  function render() {
    const list = filteredTasks();
    countEl.textContent =
      list.length === allTasks.length
        ? `${allTasks.length} tasks`
        : `${list.length} of ${allTasks.length} tasks`;

    bodyEl.textContent = '';
    const frag = document.createDocumentFragment();

    for (const task of list) {
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      tdId.className = 'id-cell';
      const code = document.createElement('code');
      code.textContent = task.question_id;
      tdId.appendChild(code);

      const tdPrice = document.createElement('td');
      tdPrice.textContent =
        typeof task.price === 'number' && Number.isFinite(task.price)
          ? String(task.price)
          : '';

      const tdSet = document.createElement('td');
      tdSet.textContent = task.set || '';

      const tdVar = document.createElement('td');
      tdVar.textContent = task.variant || '';

      const tdTitle = document.createElement('td');
      tdTitle.className = 'title-cell';
      const { short, full } = truncateTitle(task.title || '');
      const hasDesc = !!(task.description && task.description.length > 0);
      const expandable = full || hasDesc;

      const desc = document.createElement('pre');
      desc.className = 'desc-block hidden';
      if (full && hasDesc) {
        desc.textContent = (task.title || '') + '\n\n' + (task.description || '');
      } else if (hasDesc) {
        desc.textContent = task.description || '';
      } else if (full) {
        desc.textContent = task.title || '';
      }

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'title-short';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = short;
      if (expandable) {
        toggle.addEventListener('click', () => {
          const nowHidden = desc.classList.toggle('hidden');
          toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
        });
      } else {
        toggle.classList.remove('title-short');
        toggle.style.cursor = 'default';
        toggle.style.textDecoration = 'none';
        toggle.style.color = 'inherit';
      }

      tdTitle.appendChild(toggle);
      if (expandable) tdTitle.appendChild(desc);

      const tdCli = document.createElement('td');
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-copy';
      copyBtn.textContent = 'Copy CLI';
      copyBtn.title = cliTemplate(task.question_id);
      copyBtn.addEventListener('click', async () => {
        const text = cliTemplate(task.question_id);
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Copied';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = 'Copy CLI';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch {
          copyBtn.textContent = 'Copy failed';
          setTimeout(() => {
            copyBtn.textContent = 'Copy CLI';
          }, 2000);
        }
      });
      tdCli.appendChild(copyBtn);

      tr.appendChild(tdId);
      tr.appendChild(tdPrice);
      tr.appendChild(tdSet);
      tr.appendChild(tdVar);
      tr.appendChild(tdTitle);
      tr.appendChild(tdCli);
      frag.appendChild(tr);
    }

    bodyEl.appendChild(frag);
  }

  async function init() {
    try {
      const res = await fetch('tasks.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      allTasks = await res.json();
      if (!Array.isArray(allTasks)) throw new Error('Invalid tasks.json');
    } catch (e) {
      loadErrorEl.textContent =
        'Could not load tasks.json. Run `bun run build:swelancer-pages` locally, or open this page from a deployment where the build step ran.';
      loadErrorEl.classList.remove('hidden');
      countEl.textContent = '';
      return;
    }

    fillSelectOptions();
    render();

    searchEl.addEventListener('input', render);
    setEl.addEventListener('change', render);
    variantEl.addEventListener('change', render);
  }

  init();
})();
