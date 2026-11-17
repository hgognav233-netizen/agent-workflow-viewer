/** Application-level session dashboard, framed by the Harness plugin. */
export function canvasHtml() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title data-en="Workflow canvas">工作流画布</title>
<style>
:root{color-scheme:light dark;--ink:light-dark(#191919,#f1f1f1);--paper:light-dark(#fff,#1e1e1e);--bg:light-dark(#f4f4f4,#151515);--soft:light-dark(#f6f6f6,#282828);--line:light-dark(#d9d9d9,#444);--mute:light-dark(#555,#b5b5b5);--brand:var(--ink);--active:light-dark(#ebebeb,#333);--bad:var(--ink);--warn:var(--active)}
:root[data-theme=light]{color-scheme:light}
:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--bg);color:var(--ink);font:14px/1.45 "Inter","Segoe UI",system-ui,sans-serif}
[hidden]{display:none!important}
button,input{font:inherit;color:inherit}
button,.button{min-height:34px;display:inline-flex;align-items:center;justify-content:center;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;text-decoration:none}
button:hover,.button:hover{border-color:var(--brand)}
button:disabled{cursor:default;color:var(--mute)}
button[aria-pressed=true]{background:var(--active);border-color:var(--brand);color:var(--brand)}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px clamp(12px,2vw,24px);background:var(--paper)}
h1,h2,h3,p{margin:0}
h1{font-size:16px;letter-spacing:-.015em}
.bar .status{margin-left:auto;font-size:12px;color:var(--mute)}
.bar .status.error{color:var(--bad)}
.currency{display:flex;align-items:center;gap:6px;font-size:12px}
.currency select{font:inherit;color:inherit;background:var(--soft);border:0;border-radius:2px;padding:6px}
#fx-rate{color:var(--mute);text-decoration:underline;text-underline-offset:2px}
.shell{display:grid;grid-template-columns:clamp(208px,23vw,280px) minmax(0,1fr);min-height:0}
.rail{min-height:0;display:flex;flex-direction:column;gap:10px;padding:14px 12px 0;background:var(--soft)}
.rail h2{font-size:13px}
.rail input{min-width:0;width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.rail input::placeholder{color:var(--mute)}
.filters{display:flex;gap:5px;flex-wrap:wrap}
.filters button{font-size:12px}
.list{min-height:0;overflow:auto;padding:2px 3px 12px;display:flex;flex-direction:column;gap:4px}
.session{width:100%;flex:none;justify-content:space-between;gap:8px;text-align:left;padding:8px;border-color:transparent;background:var(--soft)}
.session span:first-child{min-width:0}
.session b,.session small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.session b{font-size:13px;font-weight:600}
.session small,.subtle{font-size:12px;color:var(--mute)}
.session .mark{font-size:17px;line-height:1}
.session .busy{color:var(--brand);font-weight:650}
.list-note{font-size:12px;color:var(--mute);padding:5px}
.workspace{min-width:0;min-height:0;position:relative;overflow:hidden}
.viewport{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;background:var(--paper)}
.viewport:active,.viewport.is-dragging *{cursor:grabbing}
.viewport:focus-visible{outline-offset:-3px}
.world{position:absolute;inset:0;transform-origin:0 0;pointer-events:none}
.relations{position:absolute;inset:0;overflow:visible;width:1px;height:1px;pointer-events:none}
.relations .relation{fill:none;stroke:var(--ink);opacity:.55;stroke-dasharray:3 4;marker-end:url(#awv-arrow)}
.node{position:absolute;width:710px;user-select:none}
.node.branch-preview{width:245px}
.node.branch-preview .node-head{min-height:25px;padding-left:14px}
.node.branch-preview .node-foot{min-height:0;padding:0 14px}
.node-head{min-height:32px;display:flex;align-items:center;gap:10px;padding:4px 14px;font-size:11px;color:var(--mute)}
.node-head .subtle,.node-head .phase{font-size:inherit}
.node-head .phase{margin:0}
.node-head button,.node-foot button{pointer-events:auto;min-height:23px;padding:2px 6px;font-size:inherit}
.node-foot{min-height:30px;display:flex;align-items:center;gap:8px;padding:4px 14px;font-size:11px;color:var(--mute)}
.node-head button,.node-foot button,.graph-view button,.tools button,.bar button{border:0;border-radius:2px;background:var(--soft)}
.node-head button:hover,.node-foot button:hover,.graph-view button:hover,.tools button:hover,.bar button:hover{background:var(--active)}
.problem{font-weight:700}
.graph-note{padding:24px 14px;color:var(--mute)}
.graph-view{position:absolute;top:12px;left:12px;display:flex;gap:4px;align-items:center;z-index:1}
.graph-view button{font-size:12px}
.graph-view button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.graph-view .subtle{margin-left:5px}
.legend{position:absolute;bottom:12px;right:12px;display:flex;gap:12px;flex-wrap:wrap;padding:8px 10px;background:var(--paper);color:var(--mute);font-size:11px;pointer-events:none}
.legend i{display:inline-block;width:16px;margin-right:4px;vertical-align:middle;border-top:1px solid currentColor}
.legend .running{border-width:2px}
.legend .failure{border-top-style:dashed}
.tools{position:absolute;bottom:12px;left:12px;display:flex;gap:4px;align-items:center;background:var(--paper)}
.tools button{min-width:34px}
.tools output{min-width:44px;text-align:center;font-size:12px;color:var(--mute)}
.canvas-empty{position:absolute;inset:12px;display:grid;place-content:center;text-align:center;pointer-events:none;color:var(--mute)}
.inspector{position:absolute;inset:58px 12px 64px auto;width:min(375px,calc(100% - 24px));overflow:auto;overscroll-behavior:contain;box-shadow:0 8px 30px #0003;z-index:2}
.panel{min-width:0;border:1px solid var(--line);border-radius:12px;background:var(--paper);padding:14px;display:grid;grid-template-columns:minmax(0,1fr);align-content:start;gap:12px}
.panel-head{display:flex;gap:8px;align-items:flex-start}
.panel-title{min-width:0;flex:1}
.panel-title h3{font-size:16px;line-height:1.35;overflow-wrap:anywhere}
.panel-title .subtle{margin-top:4px;overflow-wrap:anywhere}
.panel .remove{min-width:34px;padding:0;font-size:18px}
.phase{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--mute);margin-bottom:5px}
.phase::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.phase.busy{color:var(--brand)}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:0}
.metric{padding:7px 6px;background:var(--soft);border-radius:7px;min-width:0}
.metric dt{color:var(--mute);font-size:11px}
.metric dd{margin:0;font-size:16px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.metric.bad{background:var(--warn)}
.metric.bad dd,.metric.bad dt{color:var(--bad)}
.metric a{color:inherit}
.section-title{display:block;font-size:12px;margin-bottom:5px}
.activity{display:grid;gap:4px}
.activity a,.activity .record-summary,.agent-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;background:var(--soft);border-radius:7px;color:inherit;font-size:12px;text-decoration:none;text-align:left}
.activity a:hover,.agent-row:hover{color:var(--brand);text-decoration:underline}
.activity span,.agent-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.activity b{flex:none;max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.actions{display:flex;gap:6px;flex-wrap:wrap}
.actions .button{font-size:12px}
details{border-top:1px solid var(--line);padding-top:8px}
summary{cursor:pointer;font-size:12px;font-weight:650}
details[open] summary{margin-bottom:8px}
.agent-list{display:grid;gap:4px}
.agent-row{width:100%;border-color:transparent}
.agent-row span{flex:none;color:var(--mute)}
.agent-row .busy{color:var(--brand)}
.plot svg{display:block;width:100%;height:auto}
.plot text{fill:var(--ink);font-size:12px}
.plot .column,.plot .metadata{fill:var(--mute);font-size:11px}
.plot .wire{stroke:var(--ink);fill:none;opacity:.36;marker-end:url(#awv-arrow)}
.plot .wire.failed{opacity:.85;stroke-dasharray:3 3}
.plot .wire.busy{opacity:1}
.plot .pulse{stroke:var(--paper);fill:none;stroke-width:1;stroke-dasharray:2 10;animation:flow .8s linear infinite}
.plot .target{cursor:pointer;pointer-events:auto}
.plot .target[data-grip]{cursor:grab}
.plot .hit{fill:var(--soft)}
.plot .target:is(:hover,:focus-visible,[aria-pressed=true]) .hit{fill:var(--active)}
.plot .target.root .hit{fill:var(--ink)}
.plot .target.root text{fill:var(--paper)}
.plot .target.root:is(:hover,:focus-visible,[aria-pressed=true]) .hit{fill:var(--mute)}
.plot .target.child .hit{fill:var(--active)}
.plot .target.child:is(:hover,:focus-visible,[aria-pressed=true]) .hit{fill:var(--ink)}
.plot .target.child:is(:hover,:focus-visible,[aria-pressed=true]) text{fill:var(--paper)}
.plot:has(.branch .target:is(:hover,:focus-visible,[aria-pressed=true])) .branch:not(:has(.target:is(:hover,:focus-visible,[aria-pressed=true]))){opacity:.32}
.plot .mark{fill:var(--paper);stroke:var(--ink);stroke-width:1.25}
.plot .mark.busy{fill:var(--ink)}
.plot .mark.failed{stroke-width:1.8}
@keyframes flow{to{stroke-dashoffset:-24}}
@media(prefers-reduced-motion:reduce){.plot .pulse{animation:none}}
.evidence{padding:9px 10px;border:1px dashed var(--ink);border-radius:7px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
.selection h3{font-size:14px;margin-bottom:6px;overflow-wrap:anywhere}
.selection dl{margin:0 0 8px}
.selection dd,.selection dt{margin:0;overflow-wrap:anywhere}
.selection dt{font-size:11px;color:var(--mute);margin-top:5px}
.selection .actions{margin-top:8px}
.selection .activity{margin-top:8px}
.selection .activity button{justify-content:space-between;text-align:left;font-size:12px;gap:8px}
dialog{width:min(420px,calc(100% - 24px));max-height:80dvh;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px}
dialog::backdrop{background:#141c1766}
dialog h2{font-size:16px;overflow-wrap:anywhere;margin-bottom:10px}
dialog dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 12px;margin:0 0 12px}
dialog dt{color:var(--mute)}
dialog dd{margin:0;overflow-wrap:anywhere}
#picker{display:none}
@media(max-width:660px){
  .shell{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  #picker{display:inline-flex}
  .rail{max-height:42dvh}
  .rail.collapsed{display:none}
  .workspace{grid-row:2}
  .bar .status{order:1;margin-left:0}
  #theme{margin-left:auto}
  .legend{display:none}
}
</style></head>
<body>
<header class="bar">
  <h1 data-en="Workflow canvas">工作流画布</h1>
  <button type="button" id="picker" aria-controls="rail" aria-expanded="true" data-en="Sessions">会话列表</button>
  <span id="status" class="status" role="status" data-en="Connecting…">正在连接…</span>
  <label class="currency"><span data-en="Currency">币种</span>
    <select id="currency" aria-label="费用币种" data-en-aria-label="Cost currency"><option value="USD" data-en="USD">美元 USD</option><option value="CNY" data-en="CNY">人民币 CNY</option></select>
  </label>
  <a class="subtle" id="fx-rate" title="欧洲央行参考汇率，2026-11-13" data-en-title="ECB reference rate, 2026-11-13" href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-cny.en.html"
    target="_blank" rel="noopener noreferrer" hidden></a>
  <button type="button" id="theme" data-en="Follow system">跟随系统</button>
</header>
<div class="shell">
  <aside class="rail" id="rail" aria-labelledby="sessions-heading">
    <h2 id="sessions-heading"><span data-en="Sessions">会话</span> <span class="subtle" id="count"></span></h2>
    <input id="filter" type="search" placeholder="搜索会话、项目或模型" data-en-placeholder="Search sessions, projects or models" aria-label="搜索会话、项目或模型" data-en-aria-label="Search sessions, projects or models">
    <div class="filters" id="filters" aria-label="会话筛选" data-en-aria-label="Session filter">
      <button type="button" data-filter="all" aria-pressed="true" data-en="All">全部</button>
      <button type="button" data-filter="running" aria-pressed="false" data-en="Running">运行中</button>
      <button type="button" data-filter="selected" aria-pressed="false" data-en="Selected">已选</button>
    </div>
    <div class="list" id="list"></div>
  </aside>
  <main class="workspace" aria-label="会话画布" data-en-aria-label="Session canvas">
    <div class="viewport" id="viewport" tabindex="0" aria-label="拖动空白处平移，滚轮缩放，按方向键移动" data-en-aria-label="Drag the background to pan, scroll to zoom, use arrow keys to move">
      <div class="world" id="world"><svg class="relations" aria-hidden="true"><defs>
        <marker id="awv-arrow" viewBox="0 0 7 7" refX="7" refY="3.5" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0 0 L7 3.5 L0 7 L2 3.5 Z" fill="var(--ink)"/>
        </marker>
      </defs><g id="relations"></g></svg><div id="nodes"></div></div>
    </div>
    <p class="canvas-empty" id="empty" data-en="Loading sessions…">正在读取会话…</p>
    <nav class="graph-view" id="graph-view" aria-label="工作流显示" data-en-aria-label="Workflow display">
      <button type="button" data-mode="overview" aria-pressed="true" data-en="Overview">全览</button>
      <button type="button" data-mode="running" aria-pressed="false" data-en="Running">执行中</button>
      <button type="button" data-mode="failed" aria-pressed="false" data-en="Failures">故障</button>
      <button type="button" data-mode="cost" aria-pressed="false" data-en="Spend">费用</button>
      <span class="subtle" id="omitted-branches" hidden></span>
    </nav>
    <div class="legend" aria-hidden="true"><span><i class="running"></i><span data-en="Running">执行中</span></span><span><i class="failure"></i><span data-en="Failed at least once">曾失败</span></span><span><i></i><span data-en="Past calls">历史调用</span></span></div>
    <div class="tools" aria-label="画布视图" data-en-aria-label="Canvas view">
      <button type="button" id="zoom-out" aria-label="缩小" data-en-aria-label="Zoom out">−</button>
      <output id="zoom-value" aria-label="缩放比例" data-en-aria-label="Zoom level">100%</output>
      <button type="button" id="zoom-in" aria-label="放大" data-en-aria-label="Zoom in">+</button>
      <button type="button" id="fit" data-en="Fit canvas">适应画布</button>
    </div>
    <aside class="panel inspector" id="inspector" aria-label="会话详情" data-en-aria-label="Session details" hidden>
      <header class="panel-head"></header><div class="panel-content"></div>
      <section class="selection" hidden aria-label="所选图节点" data-en-aria-label="Selected graph node"></section>
      <details class="calls" hidden><summary></summary><div class="activity"></div></details>
      <details class="failures" hidden><summary></summary><div class="activity"></div></details>
      <details class="spend" hidden><summary></summary><div class="activity"></div></details>
      <details class="agents" hidden><summary></summary><div class="agent-list"></div></details>
    </aside>
  </main>
</div>
<dialog id="card" aria-labelledby="card-title"></dialog>
<script>${fitCamera.toString()};(${runCanvas.toString()})()</script>
</body></html>`
}

/**
 * Camera that frames `box` (world units) inside `view` (viewport pixels).
 * Returns null while the viewport is too small to measure, so a hidden or
 * still-collapsed pane cannot pin the zoom at its lower bound.
 * Serialized into the page next to runCanvas.
 */
export function fitCamera(box, view) {
  const room = { width: view.width - 48, height: view.height - 112 }
  if (!(room.width >= 120 && room.height >= 60)) return null
  const scale = Math.min(1, Math.max(.01, room.width / box.width), Math.max(.01, room.height / box.height))
  return { x: (view.width - box.width * scale) / 2 - box.left * scale,
    y: 58 + (room.height - box.height * scale) / 2 - box.top * scale, scale }
}

function runCanvas() {
  const limit = 40
  const graphWidth = 710
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = '12px Inter, "Segoe UI", system-ui, sans-serif'
  const byId = (id) => document.getElementById(id)
  const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]
  ))
  // The canvas is its own page, so the browser language decides (same t() as client.js).
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  const t = (cn, en) => zh ? cn : en
  if (!zh) {
    // The template is written in Chinese; swap in the English carried on each element.
    document.documentElement.lang = 'en'
    document.querySelectorAll('[data-en]').forEach((element) => { element.textContent = element.dataset.en })
    for (const name of ['aria-label', 'title', 'placeholder']) {
      document.querySelectorAll('[data-en-' + name + ']').forEach((element) => element.setAttribute(name, element.getAttribute('data-en-' + name)))
    }
  }
  const locale = zh ? 'zh-CN' : 'en-US'
  const number = new Intl.NumberFormat(locale)
  // ECB reference quotes for 2026-11-13, both per euro.
  const yuanPerDollar = 7.3738 / 1.1052
  const money = Object.fromEntries(['USD', 'CNY'].map((code) => [code,
    new Intl.NumberFormat(code === 'USD' ? 'en-US' : locale, { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  ]))
  const date = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(zh ? {} : { hourCycle: 'h23' }) })
  const formatDate = (value) => value && Number.isFinite(new Date(value).getTime()) ? date.format(new Date(value)) : ''
  const fmt = (n) => number.format(n ?? 0)
  const times = (n) => t(fmt(n) + ' 次', fmt(n) + '×')
  const cost = (row) => {
    if (!row.priced) return '—'
    const amount = row.usd * (currency === 'CNY' ? yuanPerDollar : 1)
    return amount > 0 && amount < .0001 ? '<' + money[currency].format(.0001) : money[currency].format(amount)
  }
  const selectedKey = 'awv.canvas.roots'
  const positionsKey = 'awv.canvas.graphPositions'
  const themeNames = { system: t('跟随系统', 'Follow system'), light: t('浅色', 'Light'), dark: t('深色', 'Dark') }
  const read = (key) => {
    try { return localStorage.getItem(key) || '' } catch { return '' }
  }
  const write = (key, value) => {
    try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
  }
  const currencySelect = byId('currency')
  const rateNote = byId('fx-rate')
  let currency = read('awv.currency') === 'CNY' ? 'CNY' : 'USD'
  rateNote.textContent = '1 USD ≈ ' + yuanPerDollar.toFixed(4) + ' CNY · 2026-11-13'
  rateNote.hidden = currency === 'USD'
  currencySelect.value = currency
  currencySelect.onchange = () => {
    currency = currencySelect.value === 'CNY' ? 'CNY' : 'USD'
    write('awv.currency', currency)
    rateNote.hidden = currency === 'USD'
    paint()
  }
  const params = new URLSearchParams(location.hash.slice(1))
  const external = location.pathname.endsWith('/canvas-board')
  const accessKey = external ? params.get('key') : ''
  let savedPositions = []
  try { savedPositions = JSON.parse(read(positionsKey)) || [] } catch { /* start with a fresh layout */ }
  const state = {
    roots: [...new Set((params.get('roots') ?? (external ? '' : read(selectedKey))).split(',').map((id) => id.trim()).filter(Boolean))].slice(0, limit),
    data: null, version: '', filter: 'all', search: '', timer: null, fetching: false, queued: false,
    nodes: new Map(), detail: null, inspected: null, selection: null, mode: 'overview',
    expanded: new Map(),
    positions: new Map(Array.isArray(savedPositions) ? savedPositions.filter((entry) => Array.isArray(entry) && Number.isFinite(entry[1]?.x) && Number.isFinite(entry[1]?.y)) : []),
    camera: { x: 0, y: 0, scale: 1 }, drag: null, positioned: false, cameraMoved: false,
  }
  state.manualPositions = new Set(state.positions.keys())
  let theme = read('awv-theme')
  function setTheme(value) {
    theme = Object.hasOwn(themeNames, value) ? value : 'system'
    document.documentElement.dataset.theme = theme
    byId('theme').textContent = themeNames[theme]
    byId('theme').setAttribute('aria-label', t('配色', 'Colour scheme') + ' · ' + themeNames[theme])
    write('awv-theme', theme)
  }
  setTheme(theme)
  byId('theme').onclick = () => {
    const themes = Object.keys(themeNames)
    setTheme(themes[(themes.indexOf(theme) + 1) % themes.length])
  }

  const narrow = matchMedia('(max-width: 660px)')
  function showPicker(open) {
    byId('rail').classList.toggle('collapsed', !open)
    byId('picker').setAttribute('aria-expanded', String(open))
  }
  if (narrow.matches && state.roots.length) showPicker(false)
  byId('picker').onclick = () => showPicker(byId('rail').classList.contains('collapsed'))

  function sessionName(session) {
    if (session.label) return session.label
    const name = session.parent ? t('子 Agent', 'Subagent') : t('会话', 'Session')
    const started = formatDate(session.created)
    return name + ' · ' + (started ? [session.project, started].filter(Boolean).join(' ') : session.id.slice(-8))
  }

  const capabilityLabels = {
    web: t('网页检索', 'Web tools'), file: t('项目文件', 'Files'), skill: t('技能', 'Skills'),
    shell: t('终端', 'Terminal'), agent: t('子 Agent', 'Subagents'), memory: t('历史会话', 'Session history'),
    plan: t('计划', 'Planning'), plugin: t('插件', 'Plugins'), tool: t('工具', 'Tools'), mcp: t('MCP 服务', 'MCP servers'),
  }
  const capabilityName = (node) => node.label || capabilityLabels[node.kind] || node.id

  // Keep controls focused when a live update changes their labels or position.
  function update(element, html) {
    if (element.rendered === html) return
    const current = document.activeElement
    const key = element.contains(current) ? current.dataset.key : null
    element.innerHTML = html
    element.rendered = html
    if (key) {
      const replacement = element.querySelector('[data-key="' + CSS.escape(key) + '"]')
      replacement?.focus({ preventScroll: true })
    }
  }

  // Preserve existing SVG elements, including pointer targets and live strokes.
  function updatePlot(element, html) {
    if (element.rendered === html) return
    const next = document.createElement('template')
    next.innerHTML = html
    const source = next.content.firstElementChild
    const current = element.firstElementChild
    if (!source?.matches('svg') || !current?.matches('svg')) {
      update(element, html)
      return
    }
    function patch(target, replacement) {
      for (const name of target.getAttributeNames()) {
        if (!replacement.hasAttribute(name)) target.removeAttribute(name)
      }
      for (const { name, value } of replacement.attributes) {
        if (target.getAttribute(name) !== value) target.setAttribute(name, value)
      }
      if (!replacement.children.length) {
        if (target.textContent !== replacement.textContent) target.textContent = replacement.textContent
        return
      }
      const keyOf = (node, index) => node.dataset.key || node.localName + ':' + index
      const existing = new Map([...target.children].map((node, index) => [keyOf(node, index), node]))
      const children = [...replacement.children]
      children.forEach((node, index) => {
        const key = keyOf(node, index)
        const match = existing.get(key)
        const child = match?.localName === node.localName ? match : node.cloneNode(true)
        if (child === match) {
          existing.delete(key)
          patch(child, node)
        }
        if (target.children[index] !== child) target.insertBefore(child, target.children[index] || null)
      })
      for (const node of existing.values()) node.remove()
    }
    patch(current, source)
    element.rendered = html
  }

  function preserveDisplay(data, mode) {
    const previous = state.data
    const scenes = new Map(previous?.roots.map((root) => [root.id, root]) || [])
    const names = new Map(previous?.sessions.map((row) => [row.id, row.label]) || [])
    return {
      ...data,
      sessions: data.sessions.map((row) => !row.label && names.get(row.id) ? { ...row, label: names.get(row.id) } : row),
      roots: data.roots.map((root) => {
        const last = scenes.get(root.id)
        const key = JSON.stringify(root)
        if (last?.displayMode === mode && (last.displayKey === key || (!root.ready && last.ready))) return last
        return { ...root, displayMode: mode, displayKey: key }
      }),
    }
  }

  function paintRail() {
    const needle = state.search.trim().toLowerCase()
    const sessions = state.data?.sessions || []
    const missing = state.roots.filter((id) => !sessions.some((row) => row.id === id))
    const rows = sessions.concat(missing.map((id) => ({ id, created: 0 }))).filter((row) => {
      const chosen = state.roots.includes(row.id)
      if (row.parent && !chosen) return false
      if (state.filter === 'running' && !row.running) return false
      if (state.filter === 'selected' && !chosen) return false
      return !needle || [sessionName(row), row.project, row.model, row.id].join(' ').toLowerCase().includes(needle)
    }).sort((a, b) => Number(b.running) - Number(a.running) || b.created - a.created)
    const list = byId('list')
    const existing = new Map([...list.querySelectorAll('[data-toggle]')].map((button) => [button.dataset.toggle, button]))
    if (!rows.length) {
      update(list, `<p class="list-note">${state.data ? t('没有符合条件的会话', 'No matching sessions') : t('正在读取会话…', 'Loading sessions…')}</p>`)
      return
    }
    list.rendered = null
    list.querySelector('.list-note')?.remove()
    rows.forEach((row, index) => {
      const chosen = state.roots.includes(row.id)
      const name = sessionName(row)
      const meta = [
        row.running ? '<span class="busy">' + t('运行中', 'Running') + '</span>' : '',
        row.project ? esc(row.project) : '',
        formatDate(row.created),
      ].filter(Boolean).join(' · ')
      let button = existing.get(row.id)
      if (!button) {
        button = document.createElement('button')
        button.className = 'session'
        button.type = 'button'
        button.draggable = true
        button.dataset.toggle = row.id
      }
      existing.delete(row.id)
      button.disabled = !chosen && state.roots.length === limit
      button.setAttribute('aria-pressed', String(chosen))
      button.setAttribute('aria-label', name)
      button.title = name
      update(button, `
        <span><b>${esc(name)}</b><small>${meta || (row.ready ? t(fmt(row.calls) + ' 次调用', fmt(row.calls) + ' calls') : t('读取中…', 'Loading…'))}</small></span>
        <span class="mark" aria-hidden="true">${chosen ? '✓' : '+'}</span>`)
      if (list.children[index] !== button) list.insertBefore(button, list.children[index] || null)
    })
    for (const button of existing.values()) button.remove()
  }

  function toggle(id, position) {
    if (position) {
      if (!state.roots.includes(id) && state.roots.length >= limit) return
      state.positions.set(id, position)
      savePosition(id)
      if (state.roots.includes(id)) { paintPositions(); return }
    }
    if (position) state.cameraMoved = true
    if (state.roots.includes(id)) state.roots = state.roots.filter((entry) => entry !== id)
    else if (state.roots.length < limit) state.roots = [...state.roots, id]
    else return
    if (!visibleIds().includes(state.inspected)) state.inspected = null
    const value = state.roots.join(',')
    if (!external) write(selectedKey, value)
    const hash = new URLSearchParams({ roots: value })
    if (external) hash.set('key', accessKey || '')
    try { history.replaceState(null, '', '#' + hash) } catch { /* selection is already saved */ }
    state.version = ''
    paint()
    if (!position && state.roots.includes(id)) {
      if (state.cameraMoved) revealNode(id)
      else state.positioned = fit()
    }
    poll()
  }

  function visibleIds() {
    const children = new Map()
    const available = new Set((state.data?.roots || []).map((row) => row.id))
    for (const row of state.data?.sessions || []) {
      if (!row.parent || !available.has(row.id)) continue
      if (!children.has(row.parent)) children.set(row.parent, [])
      children.get(row.parent).push(row.id)
    }
    const ids = new Set(state.roots)
    for (const id of ids) for (const child of children.get(id) || []) ids.add(child)
    return [...ids]
  }

  function savePosition(id) {
    state.manualPositions.add(id)
    write(positionsKey, JSON.stringify([...state.positions].filter(([key]) => state.manualPositions.has(key))))
  }

  function branchPositions(id) {
    const ids = new Set([id])
    const children = new Map()
    for (const row of state.data?.sessions || []) {
      if (!row.parent || !state.nodes.has(row.id) || state.roots.includes(row.id)) continue
      if (!children.has(row.parent)) children.set(row.parent, [])
      children.get(row.parent).push(row.id)
    }
    for (const parent of ids) for (const child of children.get(parent) || []) ids.add(child)
    return [...ids].map((key) => [key, { ...state.positions.get(key) }])
  }

  byId('list').onclick = (event) => {
    const button = event.target.closest('[data-toggle]')
    if (button) toggle(button.dataset.toggle)
  }
  byId('list').ondragstart = (event) => {
    const row = event.target.closest('[data-toggle]')
    if (!row) return
    event.dataTransfer.setData('application/x-awv-session', row.dataset.toggle)
    event.dataTransfer.effectAllowed = 'copyMove'
  }
  byId('filter').oninput = (event) => {
    state.search = event.target.value
    paintRail()
  }
  byId('filters').onclick = (event) => {
    const button = event.target.closest('[data-filter]')
    if (!button) return
    state.filter = button.dataset.filter
    byId('filters').querySelectorAll('button').forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)))
    paintRail()
  }

  function viewUrl(id, extra) {
    return './view?' + new URLSearchParams({ root: id, ...extra })
  }

  function recordLink(id, extra, label, attrs = '') {
    if (external) return '<span class="record-summary">' + label + '</span>'
    return '<a target="_blank" rel="noopener" href="' + esc(viewUrl(id, extra)) + '" ' + attrs + '>' + label + '</a>'
  }

  function paintPanel(panel, id, root, session) {
    const name = sessionName(session || { id })
    const busy = Boolean(root?.running || root?.phase?.name === 'thinking' || session?.running)
    const status = root?.running ? t('执行工具', 'Running tool') : root?.phase?.name === 'thinking' ? t('思考中', 'Thinking')
      : session?.running ? t('运行中', 'Running') : t('空闲', 'Idle')
    const meta = [session?.project, root?.model, formatDate(session?.created)].filter(Boolean).join(' · ')
    const head = `<div class="panel-title">${root?.ready ? '<span class="phase' + (busy ? ' busy' : '') + '">' + status + '</span>' : ''}
      <h3>${esc(name)}</h3>${meta ? '<p class="subtle">' + esc(meta) + '</p>' : ''}</div>
      <button type="button" class="remove" data-key="close" data-close-inspector aria-label="${t('关闭会话详情', 'Close session details')}">×</button>`
    update(panel.querySelector('.panel-head'), head)
    const content = panel.querySelector('.panel-content')
    const activity = panel.querySelector('.calls')
    const agents = panel.querySelector('.agents')
    const failuresList = panel.querySelector('.failures')
    const spend = panel.querySelector('.spend')
    agents.hidden = !root?.agents?.length
    activity.hidden = !root?.active?.length
    failuresList.hidden = !root?.recentFailures?.length
    spend.hidden = !root?.topSteps?.length
    if (!root?.ready) {
      const missing = state.data && !session
      update(content, `<p class="subtle">${missing ? t('此会话已不可用，可从画布移除。', 'This session is no longer available. Remove it from the canvas.') : t('正在读取会话日志…', 'Loading the session log…')}</p>`)
      return
    }
    const failures = fmt(root.failures)
    const failValue = root.failures ? recordLink(id, { filter: 'failed' }, failures, 'data-key="failures" aria-label="' + t('查看 ' + failures + ' 条失败记录', 'Open ' + failures + ' failure records') + '"') : failures
    const active = root.active || []
    const calls = active.map((call) => recordLink(id, { at: call.seq }, '<b>' + esc(call.name) + '</b><span>' + esc(call.summary || '') + '</span>',
      'data-key="call-' + call.seq + '" title="' + esc(call.summary || call.name) + '"')).join('')
    update(content, `<dl class="metrics">
      <div class="metric"><dt>${t('工具调用', 'Tool calls')}</dt><dd>${fmt(root.calls)}</dd></div>
      <div class="metric ${root.failures ? 'bad' : ''}"><dt>${t('失败', 'Failures')}</dt><dd>${failValue}</dd></div>
      <div class="metric"><dt>${t('执行中', 'Running')}</dt><dd>${fmt(root.running)}</dd></div>
      <div class="metric"><dt>${root.unpriced && root.priced ? t('已计价估算', 'Priced spend (est.)') : t('估算费用', 'Spend (est.)')}</dt><dd>${esc(cost(root))}</dd></div>
      </dl>
      ${external ? '' : '<div class="actions" style="margin-top:10px">' + recordLink(id, {}, t('查看会话详情', 'Open session details') + ' ↗', 'class="button" data-key="view"')
        + recordLink(id, { filter: 'thinking' }, t('查看思考记录', 'Open thinking records') + ' ↗', 'class="button" data-key="thinking"') + '</div>'}`)
    activity.querySelector('summary').textContent = t('正在执行', 'Running now') + ' · ' + fmt(root.running)
    if (activity.open) update(activity.querySelector('.activity'), calls
      + (root.running > active.length ? '<span class="subtle">' + t('另有 ' + fmt(root.running - active.length) + ' 项执行中', fmt(root.running - active.length) + ' more running') + '</span>' : ''))
    failuresList.querySelector('summary').textContent = t('近期失败', 'Recent failures') + ' · ' + fmt(root.recentFailures?.length)
    if (!failuresList.hidden && failuresList.open) update(failuresList.querySelector('.activity'), root.recentFailures.map((entry) =>
      recordLink(id, { at: entry.seq, filter: 'failed' }, '<b>' + esc(entry.name || t('工具', 'Tool')) + '</b><span>' + esc(entry.target || entry.error) + '</span>',
        'data-key="failed-' + entry.seq + '" title="' + esc(entry.error) + '"')).join(''))
    spend.querySelector('summary').textContent = t('费用最高的模型请求', 'Most expensive model requests')
    if (!spend.hidden && spend.open) update(spend.querySelector('.activity'), root.topSteps.map((step) =>
      recordLink(id, { at: step.seq }, '<b>' + esc(cost(step)) + '</b><span>' + fmt(step.prompt) + t(' 输入 / ', ' in / ') + fmt(step.output) + t(' 输出', ' out') + '</span>',
        'data-key="spend-' + step.seq + '"')).join(''))
    agents.querySelector('summary').textContent = t('子 Agent', 'Subagents') + ' · ' + fmt(root.agents?.length)
    if (agents.open) {
      const ordered = (root.agents || []).slice().sort((a, b) => Number(b.running) - Number(a.running))
      update(agents.querySelector('.agent-list'), ordered.map((agent) => {
        const label = agent.label || t('子 Agent', 'Subagent') + ' · ' + agent.id.slice(-8)
        return `<button type="button" class="agent-row" data-key="${esc(agent.id)}" data-agent="${esc(agent.id)}"
          title="${esc(label)}"><b>${esc(label)}</b><span class="${agent.running ? 'busy' : ''}">${agent.running ? t('运行中', 'Running') : t('空闲', 'Idle')}${agent.calls == null ? '' : ' · ' + t(fmt(agent.calls) + ' 次', fmt(agent.calls) + ' calls')}</span></button>`
      }).join(''))
    }
    paintSelection(root)
  }

  const viewport = byId('viewport')
  const inspector = byId('inspector')

  function paintCamera() {
    const { x, y, scale } = state.camera
    byId('world').style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    byId('zoom-value').textContent = Math.round(scale * 100) + '%'
  }

  function zoom(scale, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    const camera = state.camera
    const next = Math.min(2.5, Math.max(.01, scale))
    const ratio = next / camera.scale
    state.camera = { x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio, scale: next }
    paintCamera()
  }

  // Returns false when the viewport cannot be measured yet; the camera is left alone.
  function fit() {
    const points = [...state.nodes].map(([id, node]) => ({ ...state.positions.get(id), height: node.offsetHeight, width: node.offsetWidth }))
    if (!points.length) { state.camera = { x: 0, y: 0, scale: 1 }; paintCamera(); return true }
    const left = Math.min(...points.map((point) => point.x))
    const top = Math.min(...points.map((point) => point.y))
    const width = Math.max(...points.map((point) => point.x + point.width)) - left
    const height = Math.max(...points.map((point) => point.y + point.height)) - top
    const available = viewport.clientWidth - (!inspector.hidden && viewport.clientWidth > 700 ? inspector.offsetWidth + 24 : 0)
    const camera = fitCamera({ left, top, width, height }, { width: available, height: viewport.clientHeight })
    if (!camera) return false
    state.camera = camera
    paintCamera()
    return true
  }
  // Fit again when the viewport gets its real size, until the user moves the camera.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (!state.cameraMoved && state.roots.length) state.positioned = fit()
    }).observe(viewport)
  }

  function revealNode(id) {
    const { x, y } = state.positions.get(id)
    const node = state.nodes.get(id)
    const height = node.offsetHeight
    const width = node.offsetWidth
    const camera = state.camera
    const left = x * camera.scale + camera.x
    const top = y * camera.scale + camera.y
    if (left >= 0 && top >= 0 && left + width * camera.scale <= viewport.clientWidth
      && top + height * camera.scale <= viewport.clientHeight) return
    camera.x = viewport.clientWidth / 2 - (x + width / 2) * camera.scale
    camera.y = Math.max(62, (viewport.clientHeight - height * camera.scale) / 2) - y * camera.scale
    paintCamera()
  }

  function placeNode(id, parent) {
    if (state.positions.has(id)) return
    const others = [...state.nodes].filter(([entry]) => entry !== id && state.positions.has(entry))
      .map(([entry, node]) => ({ ...state.positions.get(entry), height: Math.max(45, node.offsetHeight), width: node.offsetWidth }))
    const source = state.nodes.get(parent)
    if (source) {
      const center = state.positions.get(parent)
      // Place alternating branches above and below their parent. Offsets increase
      // only when the next open space is occupied by another workflow.
      for (let index = 0; ; index++) {
        const ring = Math.floor(index / 4)
        const slot = index % 4
        const x = center.x + [128, 232, 418, 478][slot] + ring * 77
        const y = slot % 2 === 0 ? center.y - 101 - (slot === 2 ? 68 : 0) - ring * 94
          : center.y + source.offsetHeight + 37 + (slot === 3 ? 73 : 0) + ring * 94
        if (others.some((point) => x + 255 > point.x && x < point.x + point.width + 14
          && y + 68 > point.y && y < point.y + point.height + 14)) continue
        state.positions.set(id, { x, y })
        return
      }
    }
    const columns = Math.max(1, Math.min(4, Math.round(viewport.clientWidth / 710)))
    const places = Array.from({ length: columns }, (_, index) => {
      const x = index * 760
      const y = Math.max(0, ...others.filter((point) => x < point.x + point.width + 24 && x + graphWidth + 24 > point.x)
        .map((point) => point.y + Math.max(160, point.height) + 50))
      return { x, y }
    })
    state.positions.set(id, places.reduce((best, point) => point.y < best.y ? point : best))
  }

  function paintPositions() {
    for (const [id, node] of state.nodes) {
      const { x, y } = state.positions.get(id)
      const position = `${x}px ${y}px`
      if (node.style.translate !== position) node.style.translate = position
    }
    const anchor = (id) => {
      const node = state.nodes.get(id)
      const model = node?.querySelector('.plot svg')
      if (!model) return null
      const { x, y } = state.positions.get(id)
      return { x: x + Number(model.dataset.rootX), y: y + node.querySelector('.node-head').offsetHeight + Number(model.dataset.rootY) }
    }
    const paths = (state.data?.sessions || []).flatMap((row) => {
      if (!row.parent) return []
      const from = anchor(row.parent)
      const to = anchor(row.id)
      if (!from || !to) return []
      const bend = Math.max(44, Math.abs(to.x - from.x) * .25)
      const direction = Math.sign(to.y - from.y) || -1
      return [`<path class="relation" data-parent="${esc(row.parent)}" data-child="${esc(row.id)}"
        d="M${from.x} ${from.y} C${from.x - bend} ${from.y + direction * bend} ${to.x - bend} ${to.y} ${to.x} ${to.y}"/>`]
    })
    update(byId('relations'), paths.join(''))
  }

  function inspect(id, selection = null) {
    const changed = id !== state.inspected
    state.inspected = id
    state.selection = selection
    if (changed) {
      inspector.querySelectorAll('details').forEach((entry) => { entry.open = false })
      state.version = ''
    }
    paint()
    if (changed) poll()
  }

  function showChild(id, open) {
    if (open) state.expanded.set(id, { ...state.positions.get(id) })
    else {
      if (!state.manualPositions.has(id)) state.positions.set(id, state.expanded.get(id))
      state.expanded.delete(id)
    }
    paint()
    if (open && !state.manualPositions.has(id)) {
      const node = state.nodes.get(id)
      const point = state.positions.get(id)
      const overlaps = [...state.nodes].flatMap(([other, element]) => {
        if (other === id) return []
        const from = state.positions.get(other)
        if (from.y >= point.y + node.offsetHeight + 20 || point.y >= from.y + element.offsetHeight + 20) return []
        return [{ left: from.x, right: from.x + element.offsetWidth }]
      }).sort((a, b) => a.left - b.left)
      for (const span of overlaps) {
        if (point.x + node.offsetWidth + 28 > span.left && point.x < span.right + 28) point.x = span.right + 28
      }
      paintPositions()
    }
    if (open) revealNode(id)
  }

  function paint() {
    paintRail()
    byId('count').textContent = state.roots.length ? '· ' + t('已选 ' + fmt(state.roots.length), fmt(state.roots.length) + ' selected') : ''
    byId('empty').hidden = state.roots.length > 0
    byId('empty').textContent = state.data ? t('从会话列表选择要监看的会话', 'Select sessions to watch from the session list') : t('正在读取会话…', 'Loading sessions…')
    const visible = new Set(visibleIds())
    const omitted = state.data?.omittedBranches || 0
    byId('omitted-branches').hidden = !omitted
    byId('omitted-branches').textContent = t(fmt(omitted) + ' 个子任务分支超出显示范围', fmt(omitted) + ' child task branches are beyond the display limit')
    for (const [id, node] of state.nodes) {
      if (visible.has(id)) continue
      if (node.contains(document.activeElement)) viewport.focus({ preventScroll: true })
      node.remove()
      state.nodes.delete(id)
      state.expanded.delete(id)
      if (!state.roots.includes(id) && !state.manualPositions.has(id)) state.positions.delete(id)
    }
    for (const id of visible) {
      const root = state.data?.roots.find((entry) => entry.id === id)
      const session = state.data?.sessions.find((entry) => entry.id === id)
      let node = state.nodes.get(id)
      if (!node) {
        node = document.createElement('article')
        node.className = 'node'
        node.dataset.node = id
        node.innerHTML = '<header class="node-head" data-grip></header><div class="plot"></div><footer class="node-foot"></footer>'
        state.nodes.set(id, node)
        placeNode(id, session?.parent)
        byId('nodes').append(node)
      }
      const status = !root?.ready ? (state.data && !session ? t('会话不可用', 'Session unavailable') : t('读取中', 'Loading'))
        : root.running ? t('执行工具', 'Running tool') : root.phase?.name === 'thinking' ? t('思考中', 'Thinking')
          : session?.running ? t('运行中', 'Running') : t('空闲', 'Idle')
      const busy = Boolean(root?.running || session?.running)
      const name = sessionName(session || { id })
      const preview = Boolean(session?.parent && visible.has(session.parent) && !state.expanded.has(id))
      node.classList.toggle('branch-preview', preview)
      node.setAttribute('aria-label', name)
      const liveTool = root?.active?.[0]?.name
      update(node.querySelector('.node-head'), `<span class="phase${busy ? ' busy' : ''}">${status}${liveTool ? ' · ' + esc(liveTool) : ''}${busy ? '<span data-since="' + esc(root?.active?.[0]?.time || root?.phase?.since || '') + '"></span>' : ''}</span>
        <span class="subtle">${esc([session?.project, root?.model].filter(Boolean).join(' · '))}</span>
        ${state.expanded.has(id) ? '<button type="button" data-key="collapse" data-collapse>' + t('收起子任务', 'Collapse child task') + '</button>' : ''}`)
      const plot = node.querySelector('.plot')
      const inspected = id === state.inspected
      const settings = [name, preview, busy, status, state.mode, currency, inspected, inspected ? state.selection : null]
      if (plot.root !== root || settings.some((value, index) => value !== plot.settings?.[index])) {
        const graph = preview ? { html: drawChild(name, root, busy), hidden: 0 }
          : root?.ready ? drawGraph(root, name) : { html: '<p class="graph-note">' + esc(name) + ' · ' + status + '…</p>', hidden: 0 }
        updatePlot(plot, graph.html)
        plot.root = root
        plot.settings = settings
        plot.hiddenCount = graph.hidden
      }
      const hidden = plot.hiddenCount
      update(node.querySelector('.node-foot'), root?.ready && !preview ? `<span>${t(fmt(root.calls) + ' 次调用', fmt(root.calls) + ' calls')}${hidden ? ' · ' + t('另有 ' + fmt(hidden) + ' 个对象', fmt(hidden) + ' more objects') : ''}${state.mode !== 'cost' && root.omittedCapabilities ? ' · ' + t(fmt(root.omittedCapabilities) + ' 类能力未展开', fmt(root.omittedCapabilities) + ' capabilities not shown') : ''}</span>
        <span>${root.failures ? '<button type="button" class="problem" data-key="faults" data-faults>! ' + t(fmt(root.failures) + ' 条失败', fmt(root.failures) + ' failed') + '</button> · ' : ''}
        <button type="button" data-key="cost" data-cost>${esc(cost(root))} ${t('估算', 'est.')}${root.unpriced && root.priced ? t('（部分）', ' (partial)') : ''}</button></span>` : '')
    }
    paintPositions()
    if (!state.positioned && state.roots.length) state.positioned = fit()
    inspector.hidden = !state.inspected
    if (state.inspected) {
      const root = state.data?.roots.find((entry) => entry.id === state.inspected)
      const session = state.data?.sessions.find((entry) => entry.id === state.inspected)
      paintPanel(inspector, state.inspected, root, session)
    }
    if (state.detail) paintDetail()
    paintClocks()
  }

  function paintClocks() {
    viewport.querySelectorAll('[data-since]').forEach((clock) => {
      const since = Number(clock.dataset.since)
      if (since > 0) {
        const seconds = Math.max(0, Math.floor((Date.now() - since) / 1000))
        clock.textContent = ' · ' + (seconds < 60 ? t(seconds + ' 秒', seconds + 's')
          : t(Math.floor(seconds / 60) + ' 分 ' + seconds % 60 + ' 秒', Math.floor(seconds / 60) + 'm ' + seconds % 60 + 's'))
      }
    })
  }
  setInterval(() => { if (!document.hidden) paintClocks() }, 1000)

  byId('fit').onclick = () => { state.cameraMoved = false; fit() }
  byId('zoom-in').onclick = () => { state.cameraMoved = true; zoom(state.camera.scale * 1.12) }
  byId('zoom-out').onclick = () => { state.cameraMoved = true; zoom(state.camera.scale / 1.12) }
  byId('graph-view').onclick = (event) => {
    const button = event.target.closest('[data-mode]')
    if (!button || state.mode === button.dataset.mode) return
    state.mode = button.dataset.mode
    state.selection = null
    byId('graph-view').querySelectorAll('button').forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)))
    paint()
    poll()
  }
  viewport.ondragover = (event) => {
    if (event.dataTransfer.types.includes('application/x-awv-session')) event.preventDefault()
  }
  viewport.ondrop = (event) => {
    const id = event.dataTransfer.getData('application/x-awv-session')
    if (!state.data?.sessions.some((row) => row.id === id)) return
    event.preventDefault()
    const { x, y, scale } = state.camera
    const rect = viewport.getBoundingClientRect()
    toggle(id, { x: (event.clientX - rect.left - x) / scale, y: (event.clientY - rect.top - y) / scale })
  }
  viewport.addEventListener('wheel', (event) => {
    const mode = event.deltaMode
    if (!event.deltaY) return
    event.preventDefault()
    state.cameraMoved = true
    const rect = viewport.getBoundingClientRect()
    const delta = event.deltaY * (mode === 1 ? 16 : mode === 2 ? viewport.clientHeight : 1)
    const exponent = Math.max(-.045, Math.min(.045, -delta * .0007))
    zoom(state.camera.scale * Math.exp(exponent), event.clientX - rect.left, event.clientY - rect.top)
  }, { passive: false })
  viewport.addEventListener('keydown', (event) => {
    if (event.target.matches('.target') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault()
      event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return
    }
    if (event.target !== viewport) return
    const step = { ArrowUp: [0, 40], ArrowDown: [0, -40], ArrowLeft: [40, 0], ArrowRight: [-40, 0] }[event.key]
    if (!step) return
    event.preventDefault()
    state.cameraMoved = true
    state.camera.x += step[0]
    state.camera.y += step[1]
    paintCamera()
  })
  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return
    if (event.target.closest('button,.target:not([data-grip])')) return
    const node = event.target.closest('[data-grip]')?.closest('[data-node]')
    const id = node?.dataset.node
    state.drag = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY,
      origin: { ...state.camera }, branch: id ? branchPositions(id) : [], moved: false }
  })
  viewport.addEventListener('pointermove', (event) => {
    const drag = state.drag
    if (drag?.pointer !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return
      viewport.setPointerCapture(event.pointerId)
      viewport.classList.add('is-dragging')
      drag.moved = true
      state.cameraMoved = true
    }
    if (drag.id) {
      for (const [id, point] of drag.branch) {
        const next = { x: point.x + dx / state.camera.scale, y: point.y + dy / state.camera.scale }
        const collapsed = state.expanded.get(id)
        const previous = state.positions.get(id)
        if (collapsed && previous) {
          collapsed.x += next.x - previous.x
          collapsed.y += next.y - previous.y
        }
        state.positions.set(id, next)
      }
      paintPositions()
    } else {
      Object.assign(state.camera, { x: drag.origin.x + dx, y: drag.origin.y + dy })
      paintCamera()
    }
  })
  function endDrag(event) {
    const drag = state.drag
    if (drag?.pointer !== event.pointerId) return
    state.drag = null
    viewport.classList.remove('is-dragging')
    if (drag.id && drag.moved) {
      // Remember only the dragged anchor and any previously placed descendants.
      savePosition(drag.id)
    }
  }
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  viewport.addEventListener('click', (event) => {
    const target = event.target.closest('[data-expand],[data-collapse],[data-model],[data-cap],[data-step],[data-faults],[data-cost]')
    if (!target) return
    const { cap: capId, dot: dotId, step } = target.dataset
    const id = target.closest('[data-node]').dataset.node
    if (target.hasAttribute('data-expand') || target.hasAttribute('data-collapse')) {
      const open = target.hasAttribute('data-expand')
      showChild(id, open)
      if (event.detail === 0) state.nodes.get(id)?.querySelector(open ? '[data-model]' : '[data-expand]')?.focus({ preventScroll: true })
      return
    }
    inspect(id, capId != null ? { capId, dotId } : step != null ? { step: Number(step) } : null)
    if (target.hasAttribute('data-faults')) inspector.querySelector('.failures').open = true
    if (target.hasAttribute('data-cost')) inspector.querySelector('.spend').open = true
    if (event.detail === 0) inspector.querySelector('[data-close-inspector]')?.focus()
  })
  inspector.querySelectorAll('details').forEach((entry) => entry.addEventListener('toggle', () => {
    if (entry.open) paint()
  }))

  function drawChild(name, root, busy) {
    const chars = Array.from(name)
    const label = chars.length > 15 ? chars.slice(0, 14).join('') + '…' : name
    const note = root?.failures ? '!' + fmt(root.failures) : busy ? '●' : ''
    const width = Math.ceil(measure.measureText(label).width) + 43
    return `<svg viewBox="0 0 245 31" role="group" aria-label="${t('子任务', 'Child task')}" data-root-x="12" data-root-y="12">
      <g class="target child" tabindex="0" role="button" aria-label="${t('展开子任务', 'Expand child task')} ${esc(name)}" aria-expanded="false"
        data-key="child" data-expand data-grip><title>${esc(name)}</title>
        <rect class="hit" x="14" y="2" width="${width}" height="20"/>
        <text x="21" y="16">${esc(label)}</text><text x="${width + 7}" y="16" text-anchor="end">${esc(note || '↗')}</text>
      </g></svg>`
  }

  function drawGraph(root, name) {
    const mode = state.mode
    const selection = root.id === state.inspected ? state.selection : null
    const widths = { model: 154, cap: 148, dot: 228 }
    const truncate = (value, size) => {
      const chars = Array.from(value)
      return chars.length > size ? chars.slice(0, size - 1).join('') + '…' : value
    }
    const textWidth = (label, note, mark, max) => Math.min(max, Math.ceil(measure.measureText(label).width
      + (note ? measure.measureText(note).width + 14 : 0)) + (mark ? 26 : 14))
    const target = ({ kind, x, y, name, note, key, attrs, active, running, failed }) => {
      const rootLabel = kind === 'model'
      const mark = failed && !running
        ? `<path class="mark failed" d="M${x + 10} ${y - 4} l4 4 -4 4 -4 -4 Z"/>`
        : running ? `<circle class="mark busy" cx="${x + 10}" cy="${y}" r="2.5"/>` : ''
      const label = truncate(name, rootLabel ? 11 : kind === 'cap' ? (note ? 8 : 11) : (note ? 14 : 17))
      const width = textWidth(label, note, mark, widths[kind])
      const offset = mark ? 19 : 7
      return `<g class="target${rootLabel ? ' root' : ''}" tabindex="0" role="button" aria-pressed="${Boolean(active)}"
        aria-label="${esc(name + (note ? ' · ' + note : ''))}" data-key="${esc(key)}" ${attrs}>
        <title>${esc(name + (note ? ' · ' + note : ''))}</title>
        <rect class="hit" x="${x}" y="${y - 9}" width="${width}" height="18"/>
        ${mark}<text class="label" x="${x + offset}" y="${y + 4}">${esc(label)}</text>
        ${note ? '<text class="metadata" x="' + (x + width - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(note) + '</text>' : ''}</g>`
    }
    const wire = (from, y1, to, y2, item) => {
      const x1 = from + 2
      const x2 = to - 2
      const bend = (x2 - x1) * (Math.abs(y2 - y1) > 60 ? .88 : .55)
      const d = `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`
      const stroke = item.running ? 1.9 : item.failed ? 1.15 : .85
      return `<path class="wire${item.running ? ' busy' : item.failed ? ' failed' : ''}" d="${d}" stroke-width="${stroke}"/>
        ${item.running ? '<path class="pulse" d="' + d + '"/>' : ''}`
    }
    const wrap = (height, mid, body) => `<svg viewBox="0 0 ${graphWidth} ${height}" role="group" aria-label="${t('会话工作流图', 'Session workflow graph')}"
      data-root-x="12" data-root-y="${mid}">${body}</svg>`
    const model = (y) => target({ kind: 'model', x: 14, y, name, key: 'model', attrs: 'data-model data-grip',
      active: root.id === state.inspected && !selection })
    const modelEnd = 14 + textWidth(truncate(name, 11), '', false, widths.model)
    if (mode === 'cost') {
      const steps = root.topSteps || []
      const heights = steps.map((_, index) => 22 + index * 27)
      const y = heights.length ? (heights[0] + heights.at(-1)) / 2 : 22
      const body = steps.map((step, index) => {
        const x = 360 + (index % 3) * 36
        return wire(modelEnd, y, x, heights[index], {})
          + target({ kind: 'dot', x, y: heights[index], name: t('模型请求', 'Model request') + ' #' + step.seq, note: cost(step), key: 'step-' + step.seq,
            attrs: 'data-step="' + step.seq + '"', active: selection?.step === step.seq })
      }).join('')
      const note = steps.length ? '' : '<text class="metadata" x="228" y="26">' + t('当前会话没有可显示的费用记录', 'This session has no spend records to show') + '</text>'
      return { html: wrap(Math.max(46, (heights.at(-1) || 22) + 18), y, body + model(y) + note), hidden: 0 }
    }

    const matches = (item) => mode === 'running' ? item.running : mode === 'failed' ? item.failed : true
    const nodes = (root.nodes || []).filter(matches).sort((a, b) => a.id.localeCompare(b.id))
    let cursor = 20
    let rowsLeft = 13
    let shown = 0
    const groups = nodes.map((node, index) => {
      const eligible = node.dots.filter(matches)
      const remaining = nodes.length - index
      const count = Math.max(0, Math.min(eligible.length, rowsLeft - remaining + 1, 4))
      const pinned = selection?.capId === node.id && eligible.find((dot) => String(dot.id) === selection.dotId)
      const dots = eligible.slice(0, count)
      if (pinned && count && !dots.includes(pinned)) dots[count - 1] = pinned
      rowsLeft -= Math.max(1, dots.length)
      const from = cursor
      const seed = Array.from(node.id).reduce((sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0, 0)
      const x = 196 + (seed % 5) * 14
      const hub = from + Math.max(0, dots.length - 1) * (10 + seed % 5)
      cursor += Math.max(1, dots.length) * 25 + 9 + seed % 8
      shown += dots.length
      return { node, hub, x, dots: dots.map((dot, i) => ({ dot, x: 406 + (seed + i * 3) % 5 * 16, y: from + i * 24 })) }
    })
    const mid = groups.length ? (groups[0].hub + groups.at(-1).hub) / 2 : 22
    const content = groups.map(({ node, hub, x, dots }) => {
      const key = node.id
      const attrs = 'data-cap="' + esc(key) + '"'
      const capName = capabilityName(node)
      const capNote = mode === 'failed' ? '!' + fmt(node.failed) : times(node.hits)
      const capEnd = x + textWidth(truncate(capName, 8), capNote, node.running || node.failed, widths.cap)
      const branch = wire(modelEnd, mid, x, hub, node) + dots.map(({ dot, x: to, y }) => wire(capEnd, hub, to, y, dot)).join('')
      const hubLabel = target({ kind: 'cap', x, y: hub, name: capName, key, attrs,
        note: capNote, running: node.running, failed: node.failed,
        active: selection?.capId === key && selection.dotId == null })
      const labels = dots.map(({ dot, x: to, y }) => target({ kind: 'dot', x: to, y, name: dot.label || t('对象', 'Object'), key: key + ':' + dot.id,
        note: (dot.failed ? '!' + fmt(dot.failed) + ' · ' : '') + (dot.running && dot.activeName ? truncate(dot.activeName, 8) : times(dot.hits)),
        attrs: attrs + ' data-dot="' + esc(dot.id) + '"', running: dot.running, failed: dot.failed,
        active: selection?.capId === key && selection.dotId === String(dot.id) })).join('')
      return '<g class="branch" data-key="branch-' + esc(key) + '">' + branch + hubLabel + labels + '</g>'
    }).join('')
    const empty = mode === 'running' ? t('当前没有工具调用在执行', 'No tool calls are running')
      : mode === 'failed' ? t('当前记录窗口内没有工具失败', 'No tool failures in the current record window') : t('暂无工具调用', 'No tool calls yet')
    const note = groups.length ? '' : '<text class="metadata" x="228" y="26">' + empty + '</text>'
    const total = mode === 'overview' ? nodes.reduce((sum, node) => sum + node.count, 0)
      : nodes.reduce((sum, node) => sum + node.dots.filter(matches).length, 0)
    return { html: wrap(Math.max(46, cursor - 7), mid, content + model(mid) + note), hidden: Math.max(0, total - shown) }
  }

  function paintSelection(root) {
    const section = inspector.querySelector('.selection')
    const selected = state.selection
    section.hidden = !selected
    if (!selected) return
    const step = root.topSteps?.find((entry) => entry.seq === selected.step)
    const node = root.nodes?.find((entry) => entry.id === selected.capId)
    const dot = node?.dots.find((entry) => String(entry.id) === selected.dotId)
    const link = (label, seq, filter) => external || seq == null ? '' : `<a class="button" data-key="${seq}-${filter || 'all'}" target="_blank" rel="noopener"
      href="${esc(viewUrl(root.id, { at: seq, ...(filter ? { filter } : {}) }))}">${label} ↗</a>`
    let title = t('该节点已离开当前记录窗口', 'This node has left the current record window')
    let rows = []
    let actions = ''
    let evidence = ''
    let related = ''
    if (step) {
      title = t('模型请求', 'Model request') + ' #' + step.seq
      rows = [[t('费用估算', 'Spend (est.)'), cost(step)], [t('输入 Token', 'Input tokens'), fmt(step.prompt)],
        [t('缓存命中 Token', 'Cached input tokens'), fmt(step.cache)], [t('输出 Token', 'Output tokens'), fmt(step.output)]]
      actions = link(t('查看对应记录', 'Open record'), step.seq)
    } else if (node && (selected.dotId == null || dot)) {
      const item = dot || node
      const cap = capabilityName(node)
      title = dot ? cap + ' → ' + (dot.label || t('对象', 'Object')) : cap
      rows = [[t('工具调用', 'Tool calls'), fmt(item.hits)], [t('执行中 / 失败', 'Running / failed'), fmt(item.running) + ' / ' + fmt(item.failed)]]
      if (dot?.callers?.length) rows.push([t('调用工具', 'Callers'), dot.callers.map(({ name, hits }) => name + ' ×' + fmt(hits)).join(' · ')])
      if (dot?.detail) rows.push([t('对象', 'Object'), dot.detail])
      if (dot?.timed) rows.push([t('平均耗时', 'Average time'), Math.round(dot.totalMs / dot.timed) + ' ms'])
      if (!dot && node.usd > 0) rows.push([t('关联的输入费用估算', 'Related input spend (est.)'), cost({ priced: true, usd: node.usd })])
      if (!dot) {
        const objects = node.dots.filter((entry) => state.mode === 'failed' ? entry.failed : state.mode === 'running' ? entry.running : true)
        if (objects.length) related = '<div class="activity">' + objects.map((entry) =>
          `<button type="button" data-key="inspect-${entry.id}" data-inspect-dot="${entry.id}" title="${esc(entry.label)}">
            <span>${esc(entry.label || t('对象', 'Object'))}</span><span>${entry.running ? t('执行中', 'Running') + ' · ' : ''}${entry.failed ? '!' + fmt(entry.failed) + ' · ' : ''}${times(entry.hits)}</span></button>`).join('') + '</div>'
      } else actions = '<button type="button" data-key="cap-back" data-inspect-cap>' + t('返回能力', 'Back to capability') + '</button>'
      evidence = root.evidence?.[item.failureSeq]
      actions += link(t('正在执行的记录', 'Running record'), dot?.activeSeq) + link(t('最近失败', 'Last failure'), item.failureSeq, 'failed')
      if (item.seq !== item.failureSeq && item.seq !== dot?.activeSeq) actions += link(t('最近调用', 'Last call'), item.seq)
    }
    update(section, `<h3>${esc(title)}</h3>${rows.length ? '<dl>' + rows.map(([key, value]) =>
      '<dt>' + esc(key) + '</dt><dd>' + esc(value) + '</dd>').join('') + '</dl>' : ''}
      ${evidence ? '<p class="evidence">' + esc(evidence) + '</p>' : ''}
      ${actions ? '<div class="actions">' + actions + '</div>' : ''}${related}`)
  }

  function paintDetail() {
    const dialog = byId('card')
    const { id, agentId } = state.detail
    const root = state.data?.roots.find((entry) => entry.id === id)
    const agent = root?.agents?.find((entry) => entry.id === agentId)
    let name = t('记录已离开当前视图', 'This record has left the current view')
    let rows = []
    let action = ''
    if (agent) {
      name = agent.label || t('子 Agent', 'Subagent') + ' · ' + agent.id.slice(-8)
      rows = [[t('状态', 'Status'), agent.running ? t('运行中', 'Running') : t('空闲', 'Idle')], [t('层级', 'Depth'), agent.depth],
        [t('调用', 'Calls'), agent.calls == null ? t('读取中…', 'Loading…') : fmt(agent.calls)], [t('估算费用', 'Spend (est.)'), cost(agent)]]
      if (state.nodes.has(agent.id)) action = `<button type="button" data-key="locate" data-locate="${esc(agent.id)}">${t('在画布定位', 'Locate on canvas')}</button>`
    }
    update(dialog, `<h2 id="card-title">${esc(name)}</h2>${rows.length ? '<dl>' + rows.map(([key, value]) =>
      '<dt>' + esc(key) + '</dt><dd>' + esc(value ?? '—') + '</dd>').join('') + '</dl>' : ''}
      <form method="dialog" class="actions">${action}<button type="submit" data-key="close" autofocus>${t('关闭', 'Close')}</button></form>`)
  }

  function closeInspector() {
    const node = state.nodes.get(state.inspected)
    inspect(null)
    node?.querySelector('.target[data-model]')?.focus({ preventScroll: true })
  }

  inspector.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-inspector]')) { closeInspector(); return }
    const object = event.target.closest('[data-inspect-dot],[data-inspect-cap]')
    if (object && state.selection?.capId) {
      inspect(state.inspected, { capId: state.selection.capId, dotId: object.dataset.inspectDot })
      inspector.querySelector('.selection h3')?.scrollIntoView({ block: 'nearest' })
      inspector.querySelector('.selection button')?.focus({ preventScroll: true })
      return
    }
    const target = event.target.closest('[data-agent]')
    if (!target) return
    state.detail = { id: state.inspected, agentId: target.dataset.agent }
    paintDetail()
    byId('card').showModal()
  })
  inspector.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeInspector()
  })
  byId('card').addEventListener('close', () => { state.detail = null })
  byId('card').addEventListener('click', (event) => {
    const locate = event.target.closest('[data-locate]')
    if (locate && state.nodes.has(locate.dataset.locate)) {
      byId('card').close()
      state.detail = null
      revealNode(locate.dataset.locate)
      state.nodes.get(locate.dataset.locate).querySelector('.target')?.focus({ preventScroll: true })
    }
  })

  async function poll() {
    clearTimeout(state.timer)
    if (document.hidden) return
    if (state.fetching) { state.queued = true; return }
    state.fetching = true
    const roots = state.roots
    const inspected = state.inspected
    const mode = state.mode
    const status = byId('status')
    let delay = 1500
    try {
      const query = new URLSearchParams({ roots: roots.join(','), version: state.version, compact: '1', graphs: '1', family: '1', mode })
      if (inspected) query.set('inspect', inspected)
      if (external && !zh) query.set('lang', 'en')
      const headers = { accept: 'application/json' }
      if (external) headers.authorization = 'Bearer ' + (accessKey || '')
      const response = await fetch((external ? './canvas-board-data?' : './canvas-data?') + query, { headers })
      if (response.status !== 204) {
        if (!response.ok) throw new Error(String(response.status))
        const data = await response.json()
        if (roots !== state.roots || inspected !== state.inspected || mode !== state.mode) return
        const firstGraphs = data.roots.some((root) => !state.data?.roots.some((entry) => entry.id === root.id && (entry.ready || !root.ready)))
        state.data = preserveDisplay(data, mode)
        state.version = data.version || ''
        paint()
        if (firstGraphs && !state.cameraMoved) state.positioned = fit()
      }
      const live = t('实时更新', 'Live')
      if (status.textContent !== live) status.textContent = live
      status.classList.remove('error')
    } catch (error) {
      delay = 3000
      status.textContent = ['401', '403'].includes(error.message)
        ? external ? t('链接已失效，请从 Harness 重新打开', 'This link has expired. Reopen it from Harness.') : t('连接受限，请从 Harness 打开', 'Access is restricted. Open it from Harness.')
        : t('更新失败，正在重试', 'Update failed. Retrying…')
      status.classList.add('error')
    } finally {
      state.fetching = false
      const queued = state.queued
      state.queued = false
      if (!document.hidden) state.timer = setTimeout(poll, queued ? 0 : delay)
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(state.timer)
    else poll()
  })
  paint()
  poll()
}
