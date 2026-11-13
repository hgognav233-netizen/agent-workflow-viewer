/**
 * Multi-session canvas page: several Harness sessions side by side, each with
 * its own capability map and the subagents it dispatched. Served same-origin to
 * the plugin's main panel and usable on its own.
 */
export function canvasHtml() {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>工作流画布</title>
<style>
:root{color-scheme:light;--ink:#171717;--paper:#fdfdfb;--line:#e5e5e0;--guide:#d8d8d2;--soft:#5f5f5a;--mute:#7b7b76;--bad:#a33c47;--live:#1a7f4b;--chip:#f1f1ec;--card:#fff;--rail:#f7f7f3}
:root[data-theme=dark]{color-scheme:dark;--ink:#e8e6df;--paper:#151517;--line:#2b2b2f;--guide:#34343b;--soft:#9b9b93;--mute:#8d8d85;--bad:#e0798a;--live:#5fd08d;--chip:#222226;--card:#1d1d20;--rail:#111113}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--ink:#e8e6df;--paper:#151517;--line:#2b2b2f;--guide:#34343b;--soft:#9b9b93;--mute:#8d8d85;--bad:#e0798a;--live:#5fd08d;--chip:#222226;--card:#1d1d20;--rail:#111113}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;font:13px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink);display:flex;min-height:0}
.rail{width:232px;flex:none;border-right:1px solid var(--line);background:var(--rail);display:flex;flex-direction:column;min-height:0}
.railhead{display:flex;align-items:center;gap:6px;padding:10px 10px 6px}
.railhead b{font-size:12px;letter-spacing:.02em}
.railhead .sp{margin-left:auto;display:flex;gap:4px}
.rail input{font:inherit;font-size:12px;margin:0 10px 8px;padding:4px 7px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:inherit}
.rail input::placeholder{color:var(--mute)}
.list{overflow:auto;min-height:0;padding:0 6px 10px}
.session{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:7px;cursor:pointer;border:1px solid transparent}
.session:hover{background:var(--chip)}
.session.on{border-color:var(--soft);background:var(--chip)}
.session .mark{font:10px ui-monospace,monospace;color:var(--mute);width:10px;flex:none}
.session .body{min-width:0;flex:1}
.session .name{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.session .meta{font:10px ui-monospace,monospace;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.session .tog{flex:none;font:11px ui-monospace,monospace;border:1px solid var(--line);background:var(--paper);color:inherit;border-radius:6px;padding:1px 6px;cursor:pointer}
.session .tog[aria-pressed=true]{border-color:var(--soft)}
.railtip{padding:8px 10px;border-top:1px solid var(--line);color:var(--mute);font-size:11px}
button{font:inherit;color:inherit;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:2px 7px;cursor:pointer}
button:hover{border-color:var(--soft)}
#theme{min-width:26px;padding:1px 5px}
main.canvas{flex:1;min-width:0;min-height:0;overflow:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;align-content:start}
.panel{border:1px solid var(--line);border-radius:10px;background:var(--paper);display:flex;flex-direction:column;min-width:0;overflow:hidden}
.phead{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid var(--line);font-size:12px;flex-wrap:nowrap;min-width:0}
.phead b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%;flex:none}
.phead .model{font:10px ui-monospace,monospace;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;min-width:0}
.phead .stats{margin-left:auto;font:10px ui-monospace,monospace;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}
.phead .rm{flex:none}
.pplot{padding:4px 6px 6px}
.pplot svg{display:block;width:100%;height:auto}
.zone{fill:var(--soft);font:8px ui-monospace,monospace}
.lbl{fill:var(--ink);font:8.5px ui-monospace,monospace;paint-order:stroke;stroke:var(--paper);stroke-width:2.2;stroke-linejoin:round;pointer-events:none}
.hublbl{fill:var(--ink);font:9px ui-monospace,monospace;paint-order:stroke;stroke:var(--paper);stroke-width:2.4;stroke-linejoin:round;pointer-events:none}
.agentlbl{fill:var(--soft);font:8px ui-monospace,monospace;paint-order:stroke;stroke:var(--paper);stroke-width:2.2;stroke-linejoin:round;pointer-events:none}
.wire{stroke:var(--ink);fill:none}
.live-wire{stroke:var(--live);stroke-dasharray:3 16;animation:flow 1.15s linear infinite}
.live-ring{transform-box:fill-box;transform-origin:center;animation:ping 1.45s ease-out infinite}
@keyframes flow{to{stroke-dashoffset:-38}}
@keyframes ping{from{transform:scale(.8);opacity:.85}to{transform:scale(2.2);opacity:0}}
.empty{color:var(--mute);font-size:12px;padding:20px;border:1px dashed var(--line);border-radius:10px}
.card{position:fixed;right:16px;bottom:16px;width:260px;max-height:60vh;overflow:auto;background:var(--card);border:1px solid var(--soft);border-radius:10px;padding:10px 11px;box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:12px;z-index:20}
.card.hidden{display:none}
.card h3{margin:0 0 6px;font-size:13px;overflow-wrap:anywhere}
.card dl{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:6px 0}
.card dt{color:var(--mute);font-size:11px}
.card dd{margin:0;font:11px ui-monospace,monospace;overflow-wrap:anywhere}
.card .acts{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
.chip{display:inline-block;font:10px ui-monospace,monospace;border:1px solid var(--line);border-radius:99px;padding:0 6px;color:var(--mute)}
.chip.running{color:var(--live);border-color:var(--live)}
.chip.bad{color:var(--bad);border-color:var(--bad)}
</style></head>
<body>
<aside class="rail">
  <div class="railhead"><b>会话</b><span class="chip" id="count">0</span>
    <span class="sp"><button type="button" id="theme" title="配色">◐</button></span>
  </div>
  <input id="filter" placeholder="筛选会话…" aria-label="筛选会话">
  <div class="list" id="list"></div>
  <div class="railtip">点 + 把会话加入画布 · 最多 6 个</div>
</aside>
<main class="canvas" id="canvas"><div class="empty" id="empty">左侧点 + 把会话加入画布</div></main>
<div class="card hidden" id="card"></div>
<script>
var MAXROOTS = 6;
var state = { roots: readRoots(), data: null, version: '', filter: '', card: null };
var THEMES = ['system', 'light', 'dark'];
var ICONS = { system: '◐', light: '☀', dark: '☾' };
var theme = 'system';
try { theme = localStorage.getItem('awv-theme') || 'system' } catch (error) { theme = 'system' }
function byId(id) { return document.getElementById(id) }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function fmt(n) {
  n = Number(n) || 0;
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
}
function money(usd) {
  var value = Number(usd) || 0;
  if (value >= 1) return '$' + value.toFixed(2);
  if (value >= 0.01) return '$' + value.toFixed(3);
  return '$' + value.toFixed(4);
}
function short(text, limit) {
  var chars = Array.from(String(text == null ? '' : text));
  return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join('');
}
function readRoots() {
  var fromHash = '';
  try { fromHash = new URLSearchParams(location.hash.slice(1)).get('roots') || '' } catch (error) { fromHash = '' }
  if (fromHash) return fromHash.split(',').map(function (id) { return id.trim() }).filter(Boolean).slice(0, MAXROOTS);
  var saved = '';
  try { saved = localStorage.getItem('awv.canvas.roots') || '' } catch (error) { saved = '' }
  return saved ? saved.split(',').map(function (id) { return id.trim() }).filter(Boolean).slice(0, MAXROOTS) : [];
}
function writeRoots() {
  var value = state.roots.join(',');
  try { localStorage.setItem('awv.canvas.roots', value) } catch (error) { /* storage unavailable */ }
  try { history.replaceState(null, '', value ? '#' + new URLSearchParams({ roots: value }) : location.pathname) } catch (error) { /* ignore */ }
}
function applyTheme(value) {
  theme = THEMES.indexOf(value) < 0 ? 'system' : value;
  var root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  byId('theme').textContent = ICONS[theme];
  try { localStorage.setItem('awv-theme', theme) } catch (error) { /* storage unavailable */ }
}
applyTheme(theme);
byId('theme').addEventListener('click', function () {
  applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
});
/* ---------- session rail ---------- */
function sessionName(session) {
  if (session.label) return session.label;
  if (session.parent) return '子 Agent · ' + String(session.id).slice(-8);
  return '会话 · ' + String(session.id).slice(-8);
}
function paintRail(data) {
  var sessions = (data.sessions || []).slice().sort(function (a, b) { return (b.created || 0) - (a.created || 0) });
  byId('count').textContent = state.roots.length + ' / ' + MAXROOTS;
  var needle = state.filter.trim().toLowerCase();
  var rows = sessions.filter(function (session) {
    if (!needle) return true;
    return (session.id + ' ' + sessionName(session) + ' ' + (session.model || '')).toLowerCase().includes(needle);
  });
  byId('list').innerHTML = rows.length ? rows.map(function (session) {
    var on = state.roots.indexOf(session.id) >= 0;
    return '<div class="session' + (on ? ' on' : '') + '" data-session="' + esc(session.id) + '">'
      + '<span class="mark">' + (session.running ? '●' : '·') + '</span>'
      + '<span class="body"><span class="name">' + esc(sessionName(session)) + '</span>'
      + '<span class="meta">' + (session.ready ? fmt(session.calls) + ' 调用 · ' + (session.priced ? money(session.usd) : '—') : '读取中…') + '</span></span>'
      + '<button class="tog" type="button" data-tog="' + esc(session.id) + '" aria-pressed="' + String(on) + '">' + (on ? '−' : '+') + '</button>'
      + '</div>';
  }).join('') : '<div class="empty">没有会话</div>';
}
byId('list').addEventListener('click', function (event) {
  var button = event.target.closest('[data-tog]');
  if (!button) return;
  toggle(button.getAttribute('data-tog'));
});
byId('filter').addEventListener('input', function (event) {
  state.filter = event.target.value;
  if (state.data) paintRail(state.data);
});
function toggle(id) {
  var at = state.roots.indexOf(id);
  if (at >= 0) state.roots.splice(at, 1);
  else {
    if (state.roots.length >= MAXROOTS) return;
    state.roots.push(id);
  }
  writeRoots();
  state.version = '';
  poll();
}
/* ---------- compact capability map ---------- */
function curve(from, to, bend) {
  var dx = to.x - from.x;
  return 'M' + from.x + ' ' + from.y + ' C' + (from.x + dx * .5) + ' ' + (from.y + bend)
    + ' ' + (to.x - dx * .36) + ' ' + to.y + ' ' + to.x + ' ' + to.y;
}
function layoutRoot(root) {
  var H = 300, W = 420;
  var nodes = root.nodes || [];
  var modelPoint = { x: 30, y: H / 2 - 14 };
  var hubs = nodes.slice(0, 8);
  var rows = [];
  var inner = 34;
  var pitch = 9;
  hubs.forEach(function (node, index) {
    var dots = (node.dots || []).slice(0, 8).sort(function (a, b) { return a.id - b.id }).map(function (dot, order) {
      return { dot: dot, x: 322, y: inner + index * 0 + 0 };
    });
    rows.push({ node: node, dots: dots, index: index });
  });
  return { W: W, H: H, modelPoint: modelPoint, rows: rows, pitch: pitch, inner: inner };
}
function rootPanel(root) {
  if (!root.ready) {
    return '<div class="panel"><div class="phead"><b>' + esc('会话 · ' + String(root.id).slice(-8)) + '</b><span class="stats">读取中…</span></div><div class="pplot"><div class="empty">正在读取会话日志…</div></div></div>';
  }
  var nodes = (root.nodes || []).slice(0, 8);
  var H = Math.max(300, Math.min(620, 56 + nodes.length * 46));
  var W = 420;
  var modelY = Math.min(H / 2, 40 + nodes.length * 23);
  var out = [];
  out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="会话能力图">');
  var rowH = Math.max(26, Math.min(46, (H - 40) / Math.max(1, nodes.length)));
  var cursor = 26;
  nodes.forEach(function (node, index) {
    var dots = (node.dots || []).slice(0, 8).sort(function (a, b) { return a.id - b.id });
    var blockH = Math.max(rowH, dots.length * 11 + 14);
    var hub = { x: 150 + ((index % 3) * 22), y: cursor + blockH / 2 };
    out.push('<path class="wire ' + (node.running ? 'live-wire' : '') + '" d="' + curve({ x: 30, y: modelY }, hub, (hub.y - modelY) * .18) + '" stroke-width="' + (node.running ? 1.2 : .7) + '" opacity="' + (node.running ? .9 : .22) + '"/>');
    dots.forEach(function (dot, order) {
      var y = hub.y - (dots.length - 1) * 5.5 + order * 11;
      var point = { x: 322, y: y };
      var radius = Math.min(3.2, 1.8 + Math.log2((dot.hits || 1) + 1) * .5);
      out.push('<path class="wire ' + (dot.running ? 'live-wire' : '') + '" d="' + curve(hub, point, (y - hub.y) * .18) + '" stroke-width=".5" opacity=".16"/>');
      if (dot.running) out.push('<circle cx="' + point.x + '" cy="' + point.y + '" r="' + (radius + 3) + '" fill="none" stroke="var(--live)" class="live-ring"/>');
      out.push('<circle cx="' + point.x + '" cy="' + point.y + '" r="' + radius + '" fill="' + (dot.failed ? 'var(--paper)' : 'var(--ink)') + '" stroke="' + (dot.failed ? 'var(--bad)' : 'none') + '" stroke-width="1" data-root="' + esc(root.id) + '" data-cap="' + esc(node.id) + '" data-dot="' + esc(dot.id) + '" style="cursor:pointer"><title>' + esc((dot.label || '对象') + ' · ' + (dot.hits || 0) + ' 次') + '</title></circle>');
      if (dot.label) out.push('<text class="lbl" x="' + (point.x + 7) + '" y="' + (point.y + 3) + '" font-size="8">' + esc(short(dot.label, 18)) + '</text>');
    });
    var hubR = 3 + Math.min(3.5, Math.log2((node.count || 1) + 1));
    out.push('<circle cx="' + hub.x + '" cy="' + hub.y + '" r="' + hubR + '" fill="var(--ink)" data-root="' + esc(root.id) + '" data-cap="' + esc(node.id) + '" style="cursor:pointer"><title>' + esc((node.label || node.kind) + ' · ' + node.count + ' 个对象 · ' + node.hits + ' 次') + '</title></circle>');
    out.push('<text class="hublbl" x="' + (hub.x + 8) + '" y="' + (hub.y - 5) + '" font-size="9">' + esc(short(node.label || node.kind, 12)) + '</text>');
    cursor += blockH + 4;
  });
  // subagents hang next to the model node, one small ball each
  (root.agents || []).slice(0, 6).forEach(function (agent, index) {
    var ay = modelY - 14 - index * 22;
    if (ay < 16) ay = modelY + 30 + index * 20;
    var point = { x: 58, y: ay };
    out.push('<path class="wire" d="' + curve({ x: 30, y: modelY }, point, (ay - modelY) * .3) + '" stroke-width=".8" opacity=".5" stroke-dasharray="2 3"/>');
    if (agent.running) out.push('<circle cx="' + point.x + '" cy="' + point.y + '" r="8" fill="none" stroke="var(--live)" class="live-ring"/>');
    out.push('<circle cx="' + point.x + '" cy="' + point.y + '" r="5.5" fill="' + (agent.running ? 'var(--live)' : 'var(--paper)') + '" stroke="var(--ink)" stroke-width="1" data-root="' + esc(root.id) + '" data-agent="' + esc(agent.id) + '" style="cursor:pointer"><title>' + esc((agent.label || '子 Agent') + ' · ' + (agent.calls || 0) + ' 次调用') + '</title></circle>');
    out.push('<text class="agentlbl" x="' + (point.x + 9) + '" y="' + (point.y + 3) + '" font-size="8">' + esc(short(agent.label || String(agent.id).slice(-8), 16)) + '</text>');
  });
  out.push('<circle cx="30" cy="' + modelY + '" r="6" fill="var(--ink)"/>');
  out.push('<text class="hublbl" x="30" y="' + (modelY + 20) + '" text-anchor="middle" font-size="9.5">模型</text>');
  var session = (state.data.sessions || []).find(function (entry) { return entry.id === root.id });
  var name = session ? sessionName(session) : '会话 · ' + String(root.id).slice(-8);
  var head = '<div class="phead"><b>' + esc(short(name, 22)) + '</b><span class="model">' + esc(root.model || '') + '</span>'
    + '<span class="stats">' + fmt(root.calls) + ' 调用 · ' + fmt(root.failures) + ' 失败' + (root.running ? ' · ' + fmt(root.running) + ' 运行' : '')
    + ' · ' + (root.priced ? money(root.usd) : '—') + '</span>'
    + '<button class="rm" type="button" data-remove="' + esc(root.id) + '" title="从画布移除">×</button></div>';
  return '<div class="panel">' + head + '<div class="pplot">' + out.join('') + '</svg></div></div>';
}
function paintCanvas(data) {
  var roots = data.roots || [];
  if (!state.roots.length) {
    byId('canvas').innerHTML = '<div class="empty">左侧点 + 把会话加入画布。可以把几个会话放在一起看，它们各自的子 agent 会以小球挂在母会话旁边。</div>';
    return;
  }
  byId('canvas').innerHTML = roots.map(rootPanel).join('') || '<div class="empty">正在读取…</div>';
}
/* ---------- detail card ---------- */
function hideCard() {
  var card = byId('card');
  card.classList.add('hidden');
  card.innerHTML = '';
  state.card = null;
}
function showCard(html) {
  byId('card').innerHTML = html;
  byId('card').classList.remove('hidden');
}
function findRoot(id) {
  return (state.data && (state.data.roots || []).find(function (root) { return root.id === id })) || null;
}
function objectCard(rootId, capId, dotId) {
  var root = findRoot(rootId);
  if (!root) return;
  var node = (root.nodes || []).find(function (entry) { return entry.id === capId });
  if (!node) return;
  var dot = dotId ? (node.dots || []).find(function (entry) { return String(entry.id) === String(dotId) }) : null;
  var rows = [];
  rows.push('<dt>会话</dt><dd>' + esc(String(rootId).slice(-8)) + '</dd>');
  rows.push('<dt>类别</dt><dd>' + esc(node.label || node.kind) + '</dd>');
  if (dot) {
    rows.push('<dt>对象</dt><dd>' + esc(dot.label || ('#' + dot.id)) + '</dd>');
    rows.push('<dt>次数</dt><dd>' + fmt(dot.hits) + '</dd>');
    if (dot.failed) rows.push('<dt>失败</dt><dd>' + fmt(dot.failed) + '</dd>');
    if (dot.timed) rows.push('<dt>平均耗时</dt><dd>' + Math.round(dot.totalMs / dot.timed) + ' ms</dd>');
    if (dot.detail) rows.push('<dt>位置</dt><dd>' + esc(dot.detail) + '</dd>');
  } else {
    rows.push('<dt>对象数</dt><dd>' + fmt(node.count) + '</dd>');
    rows.push('<dt>总次数</dt><dd>' + fmt(node.hits) + '</dd>');
    if (node.failed) rows.push('<dt>失败</dt><dd>' + fmt(node.failed) + '</dd>');
  }
  showCard('<h3>' + esc(dot ? (dot.label || node.label || node.kind) : (node.label || node.kind)) + '</h3><dl>' + rows.join('') + '</dl>'
    + '<div class="acts"><button type="button" data-close>关闭</button></div>');
}
function agentCard(rootId, agentId) {
  var root = findRoot(rootId);
  if (!root) return;
  var agent = (root.agents || []).find(function (entry) { return entry.id === agentId });
  if (!agent) return;
  var onCanvas = state.roots.indexOf(agent.id) >= 0;
  showCard('<h3>' + esc(agent.label || ('子 Agent · ' + String(agent.id).slice(-8))) + '</h3>'
    + '<dl><dt>状态</dt><dd>' + (agent.running ? '运行中' : '空闲') + '</dd>'
    + '<dt>层级</dt><dd>' + esc(agent.depth == null ? '—' : '第 ' + agent.depth + ' 层') + '</dd>'
    + '<dt>调用</dt><dd>' + (agent.ready === false ? '读取中…' : fmt(agent.calls || 0)) + '</dd>'
    + '<dt>花费</dt><dd>' + (agent.priced ? money(agent.usd) : '—') + '</dd>'
    + '<dt>会话</dt><dd>' + esc(String(agent.id).slice(-8)) + '</dd></dl>'
    + '<div class="acts">'
    + '<button type="button" data-add-agent="' + esc(agent.id) + '"' + (onCanvas || state.roots.length >= MAXROOTS ? ' disabled' : '') + '>'
    + (onCanvas ? '已在画布上' : '把它的会话加入画布') + '</button>'
    + '<button type="button" data-close>关闭</button></div>');
}
byId('canvas').addEventListener('click', function (event) {
  var remove = event.target.closest('[data-remove]');
  if (remove) { toggle(remove.getAttribute('data-remove')); return }
  var agent = event.target.closest('[data-agent]');
  if (agent) { agentCard(agent.getAttribute('data-root'), agent.getAttribute('data-agent')); return }
  var dot = event.target.closest('[data-cap]');
  if (dot) { objectCard(dot.getAttribute('data-root'), dot.getAttribute('data-cap'), dot.getAttribute('data-dot')); }
});
byId('card').addEventListener('click', function (event) {
  if (event.target.closest('[data-close]')) { hideCard(); return }
  var add = event.target.closest('[data-add-agent]');
  if (add && !add.disabled) { toggle(add.getAttribute('data-add-agent')); hideCard(); }
});
/* ---------- polling ---------- */
function poll() {
  if (document.hidden) { setTimeout(poll, 1200); return }
  var query = { roots: state.roots.join(','), version: state.version };
  fetch('./canvas-data?' + new URLSearchParams(query).toString(), { headers: { accept: 'application/json' } })
    .then(function (response) {
      if (response.status === 204) return null;
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(function (data) {
      if (data) {
        state.data = data;
        state.version = data.version || '';
        paintRail(data);
        paintCanvas(data);
      }
      setTimeout(poll, 1200);
    })
    .catch(function () { setTimeout(poll, 2500) });
}
poll();
</script></body></html>`
}
