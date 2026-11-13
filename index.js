/**
 * Fold the Harness session log once, then serve bounded views of that projection.
 */
export const inject = ['webServer', 'sessionQuery']

const LOG_WINDOW = 3000
const TIMELINE_LIMIT = 400
const GRAPH_DOT_LIMIT = 96
const MAX_SESSIONS = 40
const LINEAGE_TTL = 4000
const FILE_TOOLS = new Set(['read', 'write', 'edit', 'read_image', 'glob', 'grep'])
const SHELL_TOOLS = new Set(['pwsh', 'bash', 'shell', 'exec_command'])
const AGENT_TOOLS = new Set(['subagent', 'spawn_teammate', 'workflow', 'send_message', 'interrupt_agent', 'list_agents', 'wait_agent', 'team_task_create', 'team_task_update'])
const zones = { web: 'web', file: 'disk', skill: 'disk', mcp: 'external' }

function clip(value, limit) {
  const text = String(value ?? '').trim()
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text
}

function textOf(content) {
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.filter((block) => block?.type === 'text').map((block) => block.text).join('\n') : ''
}

function argumentsOf(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function pick(args, ...keys) {
  for (const key of keys) {
    if (typeof args[key] === 'string' && args[key].trim()) return args[key].trim()
  }
  return ''
}

function summarize(name, args) {
  // The graph exposes only fields used to identify an object.
  const capability = (id, kind, label = '') => ({ id, kind, label, zone: zones[kind] ?? 'process' })
  const make = (cap, key, label, detail = '') => ({ cap, key, label: clip(label, 80), detail: clip(detail, 180) })
  if (FILE_TOOLS.has(name)) {
    const path = pick(args, 'file_path', 'path', 'target', 'directory')
    const windows = /^[a-z]:|^\\\\/i.test(path)
    const normalized = windows ? path.replace(/\\/g, '/').toLowerCase() : path
    const group = normalized.match(/(?:^|\/)(\.agents|\.dsh|\.claude)(?:\/|$)/)?.[1]
    const cap = capability(group ? 'file:' + group : 'file', 'file', group)
    const pattern = pick(args, 'pattern')
    if (path) return make(cap, 'path:' + normalized, path.split(windows ? /[\\/]/ : '/').filter(Boolean).at(-1) ?? path, path)
    return make(cap, pattern ? 'pattern:' + pattern : name, pattern || name)
  }
  if (name.startsWith('mcp__')) {
    const [, server, ...parts] = name.split('__')
    const tool = parts.join('__') || name
    return make(capability('mcp:' + server, 'mcp', server || 'MCP'), tool, tool)
  }
  if (name === 'skill') {
    const skill = pick(args, 'skill', 'name')
    return make(capability('skill', 'skill'), skill || name, skill || name)
  }
  if (SHELL_TOOLS.has(name)) {
    const command = pick(args, 'command', 'cmd')
    return make(capability('shell', 'shell'), command || name, command.split('\n')[0] || name, command)
  }
  if (name === 'web_search' || name === 'web_fetch') {
    const value = pick(args, 'query', 'url')
    let label = value
    if (name === 'web_fetch' && value) {
      try { label = new URL(value).host || value } catch { /* retain the display value */ }
    }
    return make(capability('web', 'web'), value || name, label || name, value)
  }
  if (AGENT_TOOLS.has(name)) {
    const label = pick(args, 'label', 'name', 'target')
    return make(capability('agent', 'agent'), name + ':' + label, label || name)
  }
  const kind = name.startsWith('session_') ? 'memory'
    : name.startsWith('schedule_') || ['todo_write', 'create_goal', 'update_goal', 'get_goal'].includes(name) ? 'plan'
      : name.startsWith('cordis_') || name.startsWith('plugin_') ? 'plugin' : 'tool'
  return make(capability(kind, kind), name, name)
}

function createFeed() {
  return {
    next: 0, start: 0, inherited: 0, items: [], calls: new Map(), pending: new Set(),
    source: null, loading: null, revision: 0, map: null,
    modelEvents: [],
    phase: { name: 'idle', since: 0, label: '' },
  }
}

function settle(feed, status, time, turn) {
  for (const call of feed.pending) {
    if (turn != null && call.turn != null && call.turn !== turn) continue
    call.result = { status, time, text: '' }
    feed.pending.delete(call)
  }
}

function fold(feed, event) {
  const { seq, time, type, data = {} } = event
  const add = (fields) => feed.items.push({ seq, time, ...fields })
  switch (type) {
    case 'user/message':
    case 'assistant/message': {
      const user = type === 'user/message'
      if (!user) {
        feed.modelEvents.push({ seq, input: data.usage?.inputTokens ?? 0, output: data.usage?.outputTokens ?? 0 })
      }
      const text = clip(textOf(user ? data.content : data.message?.content), 1200)
      if (text) add({ kind: user ? 'user' : 'reply', text })
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    }
    case 'request/header':
    case 'request/context': {
      const config = type === 'request/header' ? data.header?.config : data
      if (config?.provider || config?.model) feed.modelEvents.push({ seq, provider: config.provider, name: config.model })
      // A model request is open from here until its assistant message settles.
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    }
    case 'tool/call': {
      const name = String(data.name || 'tool')
      const args = argumentsOf(data.arguments)
      const object = summarize(name, args)
      const summary = clip(pick(args, 'file_path', 'path', 'command', 'cmd', 'query', 'url', 'label', 'name', 'skill', 'description'), 240)
      const item = { kind: 'call', seq, time, name, summary, object, id: data.callId, turn: data.turn }
      feed.items.push(item)
      if (item.id) feed.calls.set(item.id, item)
      feed.pending.add(item)
      feed.phase = { name: 'calling', since: time, label: name }
      break
    }
    case 'tool/result': {
      const message = data.message ?? {}
      const status = message.isError || data.error ? 'failed' : 'done'
      const result = { status, time, text: clip(textOf(message.content), 700), error: clip(data.error?.reason ?? data.error?.code, 240) }
      const call = feed.calls.get(message.toolCallId)
      if (call) {
        call.result = result
        feed.pending.delete(call)
      } else {
        add({ kind: 'result', name: message.name || '', result })
      }
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    }
    case 'turn/start':
      add({ kind: 'turn', phase: 'start', turn: data.turn })
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    case 'turn/end':
      settle(feed, 'interrupted', time, data.turn)
      add({ kind: 'turn', phase: 'end', turn: data.turn, reason: data.reason?.kind })
      feed.phase = { name: 'idle', since: time, label: '' }
      break
  }
}

function append(feed, events, start) {
  feed.start = start
  for (const event of events) {
    if (event.seq < Math.max(feed.next, start)) continue
    fold(feed, event)
    feed.next = event.seq + 1
  }
  let cut = feed.items.findIndex((item) => item.seq >= start)
  if (cut < 0) cut = feed.items.length
  if (cut) {
    for (const item of feed.items.splice(0, cut)) {
      if (item.id && feed.calls.get(item.id) === item) feed.calls.delete(item.id)
      feed.pending.delete(item)
    }
  }
  if (feed.modelEvents[0]?.seq < start) feed.modelEvents = feed.modelEvents.filter((event) => event.seq >= start)
}

function modelOf(feed) {
  const model = { provider: '', name: '', requests: 0, input: 0, output: 0 }
  for (const event of feed.modelEvents) {
    if (event.input !== undefined) {
      model.requests++
      model.input += event.input
      model.output += event.output
    } else {
      model.provider = event.provider || model.provider
      model.name = event.name || model.name
    }
  }
  return model
}

function statusOf(call) {
  return call.result?.status ?? 'running'
}

function aggregate(feed) {
  if (feed.map) return feed.map
  const groups = new Map()
  const active = []
  let calls = 0
  let failures = 0
  let interrupted = 0
  for (const item of feed.items) {
    if (item.kind === 'result' && item.result.status === 'failed') failures++
    if (item.kind !== 'call') continue
    const { cap, key, label, detail } = item.object
    const status = statusOf(item)
    calls++
    failures += Number(status === 'failed')
    interrupted += Number(status === 'interrupted')
    let group = groups.get(cap.id)
    if (!group) {
      group = { ...cap, hits: 0, failed: 0, running: 0, objects: new Map() }
      groups.set(cap.id, group)
    }
    let dot = group.objects.get(key)
    if (!dot) {
      dot = { id: item.seq, label, detail, hits: 0, failed: 0, running: 0, seq: item.seq, timed: 0, totalMs: 0, callers: new Map() }
      group.objects.set(key, dot)
    }
    // Which distinct tool reached this object, so the graph can draw one line per caller.
    dot.callers.set(item.name, (dot.callers.get(item.name) ?? 0) + 1)
    group.hits++
    dot.hits++
    if (item.result?.time && item.time) {
      dot.totalMs += Math.max(0, item.result.time - item.time)
      dot.timed++
    }
    if (status === 'failed') {
      group.failed++
      dot.failed++
      dot.failureSeq = item.seq
    }
    if (status === 'running') {
      group.running++
      dot.running++
      active.push({ seq: item.seq, time: item.time, name: item.name, summary: item.summary, capId: cap.id, dotId: dot.id })
    }
    dot.seq = item.seq
  }
  const nodes = [...groups.values()].map(({ objects, ...group }) => ({
    ...group,
    count: objects.size,
    dots: [...objects.values()].map((dot) => {
      const callers = [...dot.callers].map(([name, hits]) => ({ name, hits })).sort((a, b) => b.hits - a.hits)
      return { ...dot, callers, caller: callers[0]?.name ?? '' }
    }).sort((a, b) => b.seq - a.seq),
  })).sort((a, b) => b.running - a.running || b.failed - a.failed || b.hits - a.hits || a.id.localeCompare(b.id))
  // Prioritize current and failed objects before filling the remaining graph budget.
  const visible = nodes.flatMap((node) => node.dots.slice(0, 12).concat(node.dots.slice(12).filter((dot) => dot.running || dot.failed)))
    .sort((a, b) => Number(Boolean(b.running)) - Number(Boolean(a.running)) || Number(Boolean(b.failed)) - Number(Boolean(a.failed)) || b.seq - a.seq)
  const ids = new Set(visible.slice(0, GRAPH_DOT_LIMIT).map((dot) => dot.id))
  feed.map = {
    calls, failures, interrupted, active: active.reverse().slice(0, 12), running: active.length,
    phase: feed.phase,
    nodes: nodes.map((node) => ({ ...node, dots: node.dots.filter((dot) => ids.has(dot.id)) })),
  }
  return feed.map
}

function timeline(feed, query) {
  const items = feed.items
  const anchor = query.get('at')
  const before = query.get('before')
  const after = query.get('after')
  const filter = query.get('filter')
  const filtered = items.filter((item) => {
    if (filter === 'failed') return item.result?.status === 'failed'
    if (filter === 'tools') return item.kind === 'call' || item.kind === 'result'
    return true
  })
  let index = Math.max(0, filtered.length - TIMELINE_LIMIT)
  if (anchor !== null) {
    const targetIndex = filtered.findIndex((item) => item.seq === Number(anchor))
    if (targetIndex < 0) return { items: [], missing: true, older: null, newer: null }
    index = Math.max(0, Math.min(targetIndex - Math.floor(TIMELINE_LIMIT / 2), index))
  } else if (before !== null) {
    const boundary = filtered.findIndex((item) => item.seq >= Number(before))
    index = Math.max(0, (boundary < 0 ? filtered.length : boundary) - TIMELINE_LIMIT)
    const end = boundary < 0 ? filtered.length : boundary
    return page(index, end)
  } else if (after !== null) {
    const boundary = filtered.findIndex((item) => item.seq > Number(after))
    index = boundary < 0 ? filtered.length : boundary
  }
  return page(index, Math.min(filtered.length, index + TIMELINE_LIMIT))

  function page(start, end) {
    return {
      items: filtered.slice(start, end).map(({ object, id, ...item }) => item),
      missing: false,
      older: start > 0 ? filtered[start].seq : null,
      newer: end < filtered.length ? filtered[end - 1]?.seq ?? null : null,
    }
  }
}

// Standalone board served to a detached window: same data, no plugin runtime.
function boardHtml(root) {
  const safe = JSON.stringify(root).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>工作流</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:13px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif;background:#fdfdfb;color:#171717}
@media (prefers-color-scheme:dark){body{background:#151517;color:#eceae4}header,section{border-color:#2b2b2f}}
header{padding:12px 14px;border-bottom:1px solid #e5e5e0;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
h1{font-size:15px;margin:0;letter-spacing:-.02em}
.phase{font:11px ui-monospace,monospace;display:inline-flex;gap:6px;align-items:center;color:#666}
.phase i{width:7px;height:7px;border-radius:50%;background:#9a9a92;display:inline-block}
.phase.busy i{background:#1a7f4b;animation:beat 1.4s ease-out infinite}
@keyframes beat{0%{box-shadow:0 0 0 0 rgba(26,127,75,.55)}100%{box-shadow:0 0 0 9px rgba(26,127,75,0)}}
section{padding:11px 14px;border-bottom:1px solid #eeeeea}
h2{font-size:10px;letter-spacing:.1em;color:#777;margin:0 0 7px;text-transform:uppercase;font-weight:600}
.row{display:flex;gap:8px;align-items:baseline;padding:2px 0}
.row b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%}
.row span{margin-left:auto;color:#666;font:11px ui-monospace,monospace;white-space:nowrap}
.muted{color:#7b7b76;font-size:12px}
</style></head>
<body>
<header><h1>工作流</h1><span class="phase" id="phase"><i></i><em id="phasetext">连接中…</em></span><span class="muted" id="model"></span></header>
<section><h2>总览</h2><div class="muted" id="totals">…</div></section>
<section><h2>正在执行</h2><div class="muted" id="active">无</div></section>
<section><h2>能力</h2><div class="muted" id="caps">…</div></section>
<script>
var root = ${safe};
var last = null;
function byId(id) { return document.getElementById(id) }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
function fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n) }
function paintPhase() {
  if (!last) return;
  var p = last.phase || { name: 'idle', since: 0, label: '' };
  var busy = p.name !== 'idle';
  var secs = busy ? Math.max(0, (Date.now() - p.since) / 1000) : 0;
  byId('phase').className = 'phase' + (busy ? ' busy' : '');
  byId('phasetext').textContent = !busy ? '空闲'
    : (p.name === 'calling' ? '执行中 ' + (p.label || '') : '思考中') + ' · ' + secs.toFixed(1) + 's';
}
function paint(data) {
  var model = data.model || {};
  byId('model').textContent = (model.name || '') + (model.requests ? ' · ' + model.requests + ' 次响应' : '');
  byId('totals').textContent = '调用 ' + fmt(data.calls) + ' · 失败 ' + fmt(data.failures) + ' · 运行中 ' + fmt(data.running)
    + ' · tokens ' + fmt(model.input) + ' / ' + fmt(model.output);
  var active = data.active || [];
  byId('active').innerHTML = active.length ? active.map(function (call) {
    return '<div class="row"><b>' + esc(call.name) + '</b><span>' + esc(String(call.summary || '').slice(0, 44)) + '</span></div>';
  }).join('') : '无';
  var caps = (data.nodes || []).slice(0, 9);
  byId('caps').innerHTML = caps.length ? caps.map(function (node) {
    return '<div class="row"><b>' + esc(node.label || node.kind) + '</b><span>' + node.count + ' 个对象 · ' + node.hits + ' 次'
      + (node.failed ? ' · 失败 ' + node.failed : '') + '</span></div>';
  }).join('') : '…';
  paintPhase();
}
function poll() {
  fetch('/agent-workflow/map?root=' + encodeURIComponent(root), { headers: { accept: 'application/json' } })
    .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json() })
    .then(function (data) { last = data; paint(data) })
    .catch(function (error) { byId('model').textContent = '读取失败 ' + error.message })
    .then(function () { setTimeout(poll, 1200) });
}
poll();
setInterval(paintPhase, 250);
</script></body></html>`
}

export function apply(ctx) {
  const feeds = new Map()
  const lineages = new Map()
  const epoch = Date.now().toString(36)
  let revision = 0

  function retain(cache, key, value) {
    cache.delete(key)
    cache.set(key, value)
    if (cache.size > MAX_SESSIONS) cache.delete(cache.keys().next().value)
    return value
  }

  function feedFor(id) {
    return retain(feeds, id, feeds.get(id) ?? createFeed())
  }

  function refresh(feed) {
    feed.revision = ++revision
    feed.map = null
  }

  async function readFeed(id) {
    const feed = feedFor(id)
    if (feed.loading) return feed.loading
    const live = ctx.get('sessions')?.get(id)
    if (live) {
      if (feed.source === live && feed.next === live.seq) return feed
      const inherited = live.inheritedEventCount ?? 0
      const from = Math.max(inherited, live.seq - LOG_WINDOW)
      const replace = feed.source !== live || feed.next < from || feed.next > live.seq
      const events = live.snapshotEvents(replace ? from : feed.next, live.seq)
      if (replace) Object.assign(feed, createFeed())
      append(feed, events, from)
      feed.inherited = inherited
      feed.next = live.seq
      feed.source = live
      refresh(feed)
      return feed
    }
    if (feed.source === 'disk') return feed
    feed.loading = Promise.resolve().then(async () => {
      const snapshot = await ctx.sessionQuery.readSession(id)
      const from = Math.max(snapshot.inheritedEventCount ?? 0, snapshot.events.length - LOG_WINDOW)
      const fresh = createFeed()
      append(fresh, snapshot.events.slice(from), from)
      fresh.inherited = snapshot.inheritedEventCount ?? 0
      settle(fresh, 'interrupted', 0)
      fresh.source = 'disk'
      Object.assign(feed, fresh)
      refresh(feed)
      return feed
    }).finally(() => { feed.loading = null })
    return feed.loading
  }

  async function lineageFor(root) {
    const cached = lineages.get(root)
    if (cached && (cached.loading || Date.now() - cached.at < LINEAGE_TTL)) {
      return retain(lineages, root, cached).promise
    }
    const entry = { loading: true, at: 0 }
    entry.promise = Promise.resolve().then(async () => {
      const trace = await ctx.sessionQuery.traceSession(root)
      if (!trace?.target?.header) return []
      const rows = []
      const visited = new Set()
      const labels = new Map()
      const subagents = ctx.get('subagents')
      function walk(record, descendants, depth) {
        const id = record.header?.id
        if (!id || visited.has(id)) return
        visited.add(id)
        rows.push({ id, parent: record.header.parentSession ?? null, depth, label: '' })
        for (const child of descendants ?? []) {
          if (child.session) walk(child.session, child.descendants, depth + 1)
        }
      }
      walk(trace.target, trace.descendants, 0)
      if (subagents?.listChildren) {
        await Promise.all([...new Set(rows.slice(1).map((row) => row.parent).filter(Boolean))].map(async (id) => {
          try {
            for (const child of await subagents.listChildren(id) ?? []) labels.set(child.id, child.label)
          } catch { /* session IDs still provide navigation */ }
        }))
      }
      return rows.map((row) => ({ ...row, label: clip(labels.get(row.id), 80) }))
    }).then((rows) => {
      entry.loading = false
      entry.at = Date.now()
      const signature = JSON.stringify(rows)
      entry.signature = signature
      entry.version = signature === cached?.signature ? cached.version : ++revision
      return { rows, version: entry.version }
    }).catch((error) => {
      if (lineages.get(root) === entry) lineages.delete(root)
      throw error
    })
    return retain(lineages, root, entry).promise
  }

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
    })
  }

  // Older hosts lack route admission. Limit peerless reads to the loopback listener.
  function denied(request, peer) {
    const loopback = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i
    const authority = request.headers.get('host')
    const host = authority?.replace(/^(\[[^\]]+\]|[^:]+):\d+$/, '$1')
    const crossSite = ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))
    return !peer && (!loopback.test(ctx.webServer.host) || (host && !loopback.test(host)) || crossSite)
  }

  function view(kind) {
    return async (request, peer) => {
      if (denied(request, peer)) return json({ error: 'access_denied' }, 403)
      const query = new URL(request.url, 'http://localhost').searchParams
      const root = query.get('root')
      const focus = query.get('focus') || root
      if (!root || root.length > 180 || focus.length > 180) return json({ error: 'invalid_session' }, 400)
      for (const name of ['at', 'before', 'after']) {
        if (query.has(name) && !/^\d{1,15}$/.test(query.get(name))) return json({ error: 'invalid_cursor' }, 400)
      }
      try {
        const { rows: sessions, version: lineageVersion } = await lineageFor(root)
        if (!sessions.some((row) => row.id === focus)) return json({ error: 'session_not_found' }, 404)
        const feed = await readFeed(focus)
        const version = [epoch, feed.revision, lineageVersion, kind, query.get('filter'), query.get('at'), query.get('before'), query.get('after')].join('-')
        if (query.get('version') === version) return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } })
        const data = kind === 'map' ? aggregate(feed) : timeline(feed, query)
        return json({ ...data, root, focus, sessions, version, partial: feed.start > feed.inherited, model: modelOf(feed) })
      } catch (error) {
        if (error?.code === 'SESSION_QUERY_SESSION_NOT_FOUND') return json({ error: 'session_not_found' }, 404)
        return json({ error: 'session_unavailable' }, 503)
      }
    }
  }

  function board(request, peer) {
    if (denied(request, peer)) return json({ error: 'access_denied' }, 403)
    const root = new URL(request.url, 'http://localhost').searchParams.get('root')
    if (!root || root.length > 180) return new Response('invalid session', { status: 400 })
    return new Response(boardHtml(root), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  for (const [name, resource] of [
    ['map', view('map')],
    ['snapshot', view('timeline')],
    ['view', board],
    ['ping', () => json({ ok: true, plugin: 'agent-workflow-viewer' })],
  ]) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/agent-workflow/' + name, auth: 'required', resource }))
  }
}
