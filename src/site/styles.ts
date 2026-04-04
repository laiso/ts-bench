export const STYLES = `
:root {
  --bg: #000;
  --surface: #111;
  --surface-2: #1a1a1a;
  --border: #333;
  --text: #ededed;
  --text-secondary: #888;
  --accent: #0070f3;
  --green: #50e3c2;
  --red: #ee0000;
  --link: #888;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--text); text-decoration: none; }
a:hover { color: #fff; }
.container { max-width: 960px; margin: 0 auto; padding: 48px 24px; }

/* Header */
header { margin-bottom: 48px; }
header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  margin-bottom: 8px;
}
header p { color: var(--text-secondary); font-size: 1rem; }
.updated { color: var(--text-secondary); font-size: 0.8rem; margin-top: 8px; }

/* Tabs */
.tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
}
.tab {
  padding: 12px 0;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s;
}
.tab:hover { color: var(--text); }
.tab.active {
  color: var(--text);
  border-bottom-color: var(--text);
}
.tab-content { display: none; }
.tab-content.active { display: block; }

/* Tier list */
.tier-list { display: flex; flex-direction: column; gap: 4px; }
.tier-row {
  display: flex;
  min-height: 72px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
}
.tier-row.tier-empty { opacity: 0.4; }
.tier-sort-hint {
  display: block;
  font-size: 0.55rem;
  color: rgba(255,255,255,0.5);
  font-weight: 400;
  margin-top: 2px;
  text-align: center;
  line-height: 1;
  letter-spacing: 0;
}
.tier-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 72px;
  min-width: 72px;
  font-weight: 800;
  font-size: 1.75rem;
  line-height: 1;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.tier-label-S { background: #EBB305; color: #111; }
.tier-label-A { background: #4D96FF; color: #fff; }
.tier-label-B { background: #6BCB77; color: #111; }
.tier-label-C { background: #F4A261; color: #111; }
.tier-label-D { background: #E76F51; color: #fff; }
.tier-label-F { background: #E63946; color: #fff; }
.tier-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  flex: 1;
  min-height: 72px;
}

/* Agent card */
.agent-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 150px;
  max-width: fit-content;
  text-decoration: none;
  transition: all 0.2s ease;
  position: relative;
}
.agent-card:hover {
  border-color: #555;
  background: #242424;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.agent-card-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.agent-card .agent-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: contain;
  background: transparent;
  flex-shrink: 0;
}
.agent-card .agent-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-card-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 10px;
  gap: 8px;
}
.agent-card .model-badge {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.7rem;
  color: #bbb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.agent-card .time-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
}

/* Tooltip */
.card-tooltip {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #222;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 180px;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  pointer-events: none;
}
.card-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #222;
}
.agent-card:hover .card-tooltip { display: block; }
.tooltip-title {
  font-weight: 600;
  font-size: 0.8rem;
  margin-bottom: 6px;
  color: var(--text);
}
.tooltip-task {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  padding: 2px 0;
}
.tooltip-task .task-id { color: var(--text-secondary); }

/* Tier badge (for tables) */
.tier-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  font-weight: 700;
  font-size: 0.85rem;
  border-radius: 6px;
  color: #fff;
}
.tier-badge-S { background: #ffd700; color: #000; }
.tier-badge-A { background: #87c0ff; }
.tier-badge-B { background: #b0e070; color: #000; }
.tier-badge-C { background: #f0a030; }
.tier-badge-D { background: #e06040; }
.tier-badge-F { background: #cc2222; }

/* Tables */
table { width: 100%; border-collapse: collapse; }
th, td { padding: 12px 16px; text-align: left; font-size: 0.875rem; }
th {
  color: var(--text-secondary);
  font-weight: 400;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}
td { border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--surface); }

/* Pass / fail */
.pass { color: var(--green); font-weight: 500; }
.fail { color: var(--red); font-weight: 500; }

.breakdown-grid { overflow-x: auto; }
.loading { text-align: center; padding: 80px 20px; color: var(--text-secondary); font-size: 0.9rem; }
.empty { text-align: center; padding: 40px 20px; color: var(--text-secondary); }

/* Responsive */
@media (max-width: 768px) {
  header h1 { font-size: 1.75rem; }
  .tier-label { width: 52px; min-width: 52px; font-size: 1.25rem; }
  .tier-sort-hint { display: none; }
  .agent-card { min-width: 90px; padding: 8px 10px; }
  .agent-card .agent-name-model { font-size: 0.78rem; }
  .agent-card .agent-name-model .model-part { font-size: 0.68rem; }
  th, td { padding: 8px 12px; font-size: 0.82rem; }
  .tab { font-size: 0.82rem; }
  .tier-items { flex-direction: column; align-items: flex-start; }
  .agent-card { min-width: 100%; }
  .card-tooltip { display: none !important; }
}

footer {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.8rem;
  padding: 40px 0 24px;
  border-top: 1px solid var(--border);
  margin-top: 48px;
  line-height: 2;
}
footer a { color: var(--text-secondary); }
footer a:hover { color: var(--text); }

/* Result pages */
.breadcrumb { margin-bottom: 24px; font-size: 0.9rem; color: var(--text-secondary); }
.hero { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; margin-bottom: 24px; }
.hero h1 { font-size: 1.5rem; margin-bottom: 8px; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 12px; color: var(--text-secondary); font-size: 0.9rem; }
.hero-meta strong { color: var(--text); }
.tier {
  display: inline-block;
  width: 28px; height: 28px;
  line-height: 28px;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
  border-radius: 6px;
  color: #fff;
}
.tier-S { background: #ffd700; color: #000; }
.tier-A { background: #87c0ff; }
.tier-B { background: #b0e070; color: #000; }
.tier-C { background: #f0a030; }
.tier-D { background: #e06040; }
.tier-F { background: #cc2222; }
h2 { margin-top: 32px; margin-bottom: 8px; font-size: 1.15rem; }
details { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-top: 12px; overflow: hidden; }
details summary { padding: 10px 16px; cursor: pointer; font-weight: 600; font-size: 0.9rem; }
details pre { margin: 0; padding: 12px 16px; border-top: 1px solid var(--border); }
.desc-html { font-size: 0.9rem; line-height: 1.6; }
.desc-html p { margin-bottom: 8px; }
`;

