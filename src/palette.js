// Ctrl/Cmd + K komut paleti: komutlar ve projeler tek listede, tamamen klavyeyle kullanılır.

const MAX_ITEMS = 12;

function normalize(s) {
  return s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * @param {{ commands: () => Array<{label, group, hint?, run}>, projects: () => Array<{label, hint, run}> }} sources
 */
export function setupPalette(sources) {
  const dialog = document.getElementById('palette');
  const input = document.getElementById('palette-input');
  const list = document.getElementById('palette-list');
  let items = [];
  let active = 0;
  let opener = null;

  function filter(q) {
    const nq = normalize(q.trim());
    const cmds = sources.commands().filter((c) => !nq || normalize(`${c.label} ${c.group}`).includes(nq));
    const projs = nq ? sources.projects().filter((p) => normalize(`${p.label} ${p.hint}`).includes(nq)) : [];
    return [...cmds, ...projs.map((p) => ({ ...p, group: 'proje' }))].slice(0, MAX_ITEMS);
  }

  function render() {
    list.replaceChildren(...items.map((item, i) => {
      const li = document.createElement('li');
      li.id = `pal-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      const label = document.createElement('span');
      label.textContent = item.label;
      const group = document.createElement('span');
      group.className = 'group';
      group.textContent = item.hint ? `${item.hint} · ${item.group}` : item.group;
      li.append(label, group);
      li.addEventListener('click', () => run(i));
      li.addEventListener('mousemove', () => { if (active !== i) { active = i; render(); } });
      return li;
    }));
    if (items.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Eşleşen komut veya proje yok';
      list.append(li);
    }
    input.setAttribute('aria-activedescendant', items.length ? `pal-${active}` : '');
    document.getElementById(`pal-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function update() {
    items = filter(input.value);
    active = 0;
    render();
  }

  function run(i) {
    const item = items[i];
    if (!item) return;
    close(false);
    item.run();
  }

  function open() {
    if (dialog.open) return;
    opener = document.activeElement;
    input.value = '';
    update();
    dialog.showModal();
    input.focus();
  }

  function close(restoreFocus = true) {
    if (!dialog.open) return;
    dialog.close();
    if (restoreFocus) opener?.focus?.();
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(items.length, 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(items.length, 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

  return { open, close, isOpen: () => dialog.open };
}
