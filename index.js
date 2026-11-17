/**
 * Fold the Harness session log once, then serve bounded views of that projection.
 */
import { createHash, randomBytes } from 'node:crypto'
import { canvasHtml } from './canvas.js'

export const inject = ['webServer', 'sessionQuery']

const BOARD_TTL = 2 * 60 * 60 * 1000
const BOARD_LIMIT = 24
const LOOPBACK = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i

const LOG_WINDOW = 3000
const TIMELINE_LIMIT = 400
const GRAPH_DOT_LIMIT = 96
const MAX_SESSIONS = 40
// Rows the session list may show; only their in-memory metadata is read.
const MAX_LISTED = 300
const MAX_ROOTS = 6
const LINEAGE_TTL = 4000
const FILE_TOOLS = new Set(['read', 'write', 'edit', 'read_image', 'glob', 'grep'])
const SHELL_TOOLS = new Set(['pwsh', 'bash', 'shell', 'exec_command'])
const AGENT_TOOLS = new Set(['subagent', 'spawn_teammate', 'workflow', 'send_message', 'interrupt_agent', 'list_agents', 'wait_agent', 'team_task_create', 'team_task_update'])
const zones = { web: 'web', file: 'disk', skill: 'disk', mcp: 'external' }

function sessionParent(record) {
  const { parentSession, origin } = record.header
  return !origin || origin === 'subagent' ? parentSession || null : null
}

// Session logs carry token buckets but no spend. Prices come from the public
// DeepSeek API price list; anything else is reported as unpriced rather than guessed.
// Order: [cache hit, cache miss, output] in USD per 1M tokens.
const PRICING = {
  'deepseek-flash': { peak: [0.006, 0.30, 1.20], off: [0.003, 0.15, 0.60] },
  'deepseek-v4-pro': { peak: [0.044, 1.32, 3.96], off: [0.022, 0.66, 1.98] },
}
const PRICING_AS_OF = '2026-11-13'

function priceOf(model) {
  const name = String(model || '').toLowerCase()
  if (!name) return null
  for (const key of Object.keys(PRICING)) {
    if (name === key || name.includes(key)) return PRICING[key]
  }
  return null
}

// Peak = Monday to Friday, 01:00-04:00 and 06:00-10:00 UTC. Everything else is off-peak.
function peakAt(time) {
  const at = new Date(time)
  const day = at.getUTCDay()
  if (day === 0 || day === 6) return false
  const hour = at.getUTCHours()
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)
}

function requestCost(usage, model, time) {
  const rates = priceOf(model)
  if (!rates) return { usd: null, priced: false, peak: false, rates: null }
  const peak = peakAt(time)
  const rate = peak ? rates.peak : rates.off
  const cache = Number(usage?.cacheReadTokens) || 0
  const miss = Number(usage?.inputTokens) || 0
  const output = Number(usage?.outputTokens) || 0
  return {
    usd: (cache / 1e6) * rate[0] + (miss / 1e6) * rate[1] + (output / 1e6) * rate[2],
    priced: true,
    peak,
    rates: rate,
  }
}

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
    // Child sessions are drawn as their own branches; here only the coordination
    // action is kept, named by the client (subagent → "Start child task", …).
    const label = pick(args, 'label', 'description', 'name', 'target')
    return make(capability('agent', 'agent'), name + ':' + label, label || name, label ? name : '')
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
    modelEvents: [], modelName: '', title: '', firstPrompt: '',
    phase: { name: 'idle', since: 0, label: '' },
    requests: [], lastPrompt: 0, stepCaps: [], costByCap: new Map(), catalog: new Map(),
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
      let thinking = ''
      let tokens
      if (!user) {
        const usage = data.usage || {}
        feed.modelEvents.push({ seq, input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 })
        const cost = requestCost(usage, feed.modelName, time)
        const prompt = (Number(usage.inputTokens) || 0) + (Number(usage.cacheReadTokens) || 0) + (Number(usage.cacheWriteTokens) || 0)
        if (data.usage) tokens = { input: prompt, output: Number(usage.outputTokens) || 0 }
        const delta = Math.max(0, prompt - feed.lastPrompt)
        feed.lastPrompt = prompt
        const caps = [...new Set(feed.stepCaps)]
        feed.stepCaps.length = 0
        // Split the prompt growth since the last request across the capabilities it came from.
        if (cost.priced && delta > 0 && caps.length) {
          const share = (delta / 1e6) * cost.rates[1] / caps.length
          for (const cap of caps) feed.costByCap.set(cap, (feed.costByCap.get(cap) || 0) + share)
        }
        feed.requests.push({
          seq, time, model: feed.modelName || '', prompt, step: data.step,
          output: Number(usage.outputTokens) || 0,
          cache: Number(usage.cacheReadTokens) || 0,
          usd: cost.usd, priced: cost.priced, peak: cost.peak,
        })
        // Reasoning lives in a content block, not in its own event type.
        const blocks = Array.isArray(data.message?.content) ? data.message.content : []
        thinking = clip(blocks.filter((block) => block?.type === 'reasoning')
          .map((block) => block.text).join('\n\n'), 1600)
        if (thinking) add({ kind: 'thinking', text: thinking, step: data.step, tokens })
      }
      const text = clip(textOf(user ? data.content : data.message?.content), 1200)
      if (user && text && !feed.firstPrompt && (data.source?.kind ?? 'user') === 'user') {
        feed.firstPrompt = clip(text.replace(/\s+/g, ' '), 100)
      }
      if (text || (!user && data.usage && !thinking)) {
        add({ kind: user ? 'user' : 'reply', text, step: data.step, tokens })
      }
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    }
    case 'session/title':
      feed.title = clip(data.title, 120)
      break
    case 'subagent/catalog': {
      // The parent session records the label a subagent was dispatched with.
      if (data.childId) {
        feed.catalog.set(String(data.childId), {
          label: clip(data.label || '', 80),
          mode: data.mode || '',
          createdAt: data.childCreatedAt || 0,
        })
      }
      break
    }
    case 'request/header':
    case 'request/context': {
      const config = type === 'request/header' ? data.header?.config : data
      if (config?.provider || config?.model) feed.modelEvents.push({ seq, provider: config.provider, name: config.model })
      if (config?.model) feed.modelName = config.model
      // A model request is open from here until its assistant message settles.
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    }
    case 'tool/call': {
      const name = String(data.name || 'tool')
      const args = argumentsOf(data.arguments)
      const object = summarize(name, args)
      if (object.cap?.id) feed.stepCaps.push(object.cap.id)
      const summary = clip(pick(args, 'file_path', 'path', 'command', 'cmd', 'query', 'url', 'label', 'name', 'skill', 'description'), 240)
      const item = { kind: 'call', seq, time, name, summary, object, id: data.callId, turn: data.turn, step: data.step }
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
  const model = { provider: '', name: feed.modelName || '', requests: 0, input: 0, output: 0 }
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

// Spend is an estimate: logs carry token buckets, not money.
function spendOf(feed) {
  const spend = { requests: feed.requests.length, priced: 0, unpriced: 0, usd: 0, peak: 0, asOf: PRICING_AS_OF }
  for (const request of feed.requests) {
    if (!request.priced) { spend.unpriced++; continue }
    spend.priced++
    spend.usd += request.usd
    if (request.peak) spend.peak++
  }
  return spend
}

function topSpend(feed, limit = 5) {
  return feed.requests
    .filter((request) => request.priced && request.usd > 0)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, limit)
    .map(({ seq, time, usd, prompt, output, cache, peak, model, priced }) => ({ seq, time, usd, prompt, output, cache, peak, model, priced }))
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
    group.seq = item.seq
    if (item.result?.time && item.time) {
      dot.totalMs += Math.max(0, item.result.time - item.time)
      dot.timed++
    }
    if (status === 'failed') {
      group.failed++
      dot.failed++
      group.failureSeq = item.seq
      dot.failureSeq = item.seq
    }
    if (status === 'running') {
      group.running++
      dot.running++
      dot.activeSeq = item.seq
      dot.activeName = item.name
      active.push({ seq: item.seq, time: item.time, name: item.name, summary: item.summary, capId: cap.id, dotId: dot.id })
    }
    dot.seq = item.seq
  }
  const nodes = [...groups.values()].map(({ objects, ...group }) => ({
    ...group,
    count: objects.size,
    usd: feed.costByCap.get(group.id) || 0,
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
    spend: spendOf(feed),
    topSteps: topSpend(feed),
    catalog: [...feed.catalog].map(([id, entry]) => ({ id, ...entry })),
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
    if (filter === 'thinking') return item.kind === 'thinking'
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


export function apply(ctx) {
  const feeds = new Map()
  // Live running state per session, so a busy subagent is visible from the root view.
  const live = new Map()
  const lineages = new Map()
  const boardPasses = new Map()
  const pickerReads = new Set()
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
      if (replace) Object.assign(feed, { ...createFeed(), title: feed.title, firstPrompt: feed.firstPrompt })
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
      fresh.title = feed.title
      fresh.firstPrompt = feed.firstPrompt
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

  ctx.on('agent/status', (payload) => {
    const agent = payload?.agent
    if (agent?.id) live.set(agent.id, payload.status === 'running')
  })
  ctx.on('agent/disposed', (payload) => {
    if (payload?.agent?.id) live.delete(payload.agent.id)
  })

  // Older hosts lack route admission. Limit peerless reads to the loopback listener.
  function denied(request, peer) {
    const authority = request.headers.get('host')
    const host = authority?.replace(/^(\[[^\]]+\]|[^:]+):\d+$/, '$1')
    const crossSite = ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))
    return !peer && (!LOOPBACK.test(ctx.webServer.host) || (host && !LOOPBACK.test(host)) || crossSite)
  }

  // Per-session totals for the subagent tree. Only reads feeds that are already
  // cached, and warms the rest in the background, so a response never waits on
  // another session's log.
  function cachedStats(id) {
    const feed = feeds.get(id)
    if (!feed?.source) return null
    const data = aggregate(feed)
    return { calls: data.calls, usd: data.spend.usd, priced: data.spend.priced, requests: data.spend.requests }
  }

  function withStats(rows, catalog) {
    const stats = new Map()
    const digest = []
    for (const row of rows.slice(0, 8)) {
      const cached = cachedStats(row.id)
      if (cached) {
        stats.set(row.id, cached)
        digest.push(row.id.slice(0, 8) + ':' + cached.calls + ':' + Math.round(cached.usd * 1e4))
      } else {
        digest.push(row.id.slice(0, 8) + ':?')
        readFeed(row.id).catch(() => {})
      }
    }
    return {
      sessions: rows.map((row) => ({
        ...row,
        running: live.get(row.id) === true,
        label: row.label || catalog?.get(row.id)?.label || '',
        ...(stats.get(row.id) || {}),
      })),
      digest: digest.join(','),
    }
  }

  // Cross-session overview: every recent session with its own numbers.
  // Feeds that are not cached yet are warmed a few per request, never on the
  // critical path, so one slow log cannot hold the page.
  async function overviewResource(request, peer) {
    if (denied(request, peer)) return json({ error: 'access_denied' }, 403)
    const query = new URL(request.url, 'http://localhost').searchParams
    try {
      const corpus = await ctx.sessionQuery.listSessions()
      const records = (corpus || []).slice(0, MAX_SESSIONS).map((record) => ({
        id: record.header?.id || '',
        parent: record.header?.parentSession || null,
        live: record.live === true,
        created: record.header?.createdAt || 0,
      })).filter((row) => row.id)
      const store = ctx.get('sessions')
      if (store && typeof store.list === 'function') {
        for (const session of store.list()) {
          const id = session.header ? session.header.id : String(session.id)
          live.set(id, true)
        }
      }
      let warm = 6
      const rows = records.map((record) => {
        const feed = feeds.get(record.id)
        const cached = feed && !feed.loading && feed.source
        if (!cached) {
          if (warm > 0) { warm--; readFeed(record.id).catch(() => {}) }
          return { ...record, running: live.get(record.id) === true, ready: false }
        }
        const data = aggregate(feed)
        const last = feed.items[feed.items.length - 1]
        return {
          ...record,
          running: live.get(record.id) === true,
          ready: true,
          calls: data.calls,
          failures: data.failures,
          runningCalls: data.running,
          usd: data.spend.usd,
          priced: data.spend.priced,
          requests: data.spend.requests,
          model: modelOf(feed).name,
          last: last?.time || record.created,
        }
      })
      const ready = rows.filter((row) => row.ready)
      const totals = {
        sessions: rows.length,
        ready: ready.length,
        calls: ready.reduce((sum, row) => sum + (row.calls || 0), 0),
        failures: ready.reduce((sum, row) => sum + (row.failures || 0), 0),
        usd: ready.reduce((sum, row) => sum + (row.usd || 0), 0),
        running: rows.filter((row) => row.running).length,
      }
      const version = [epoch, rows.map((row) => row.id.slice(0, 8) + ':' + (row.ready ? row.calls : '?')).join(','), totals.usd.toFixed(6)].join('-')
      if (query.get('version') === version) return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } })
      return json({ sessions: rows, totals, version, asOf: PRICING_AS_OF })
    } catch {
      return json({ error: 'session_unavailable' }, 503)
    }
  }

  // Session directory with the Harness sidebar's rules: subagent and blank
  // sessions are hidden, archived ones are opt-in, rows are grouped by
  // workspace and ordered pinned first, then by latest activity. Every read
  // here is in memory (registry state and the projection cache), no log I/O.
  function sessionDirectory(corpus) {
    const registry = ctx.get('workspaceRegistry')
    const cache = ctx.get('sessionProjectionCache')
    const attempt = (read, fallback) => {
      try { return read() ?? fallback } catch { return fallback }
    }
    const spaces = attempt(() => registry?.list?.(), [])
    const archived = new Set(attempt(() => registry?.archivedSessionIds, []))
    const pinned = new Set(attempt(() => registry?.pinnedSessionIds, []))
    const home = new Map()
    const workspaces = new Map()
    const baseName = (path) => String(path || '').split(/[\\/]/).filter(Boolean).at(-1) || ''
    for (const space of Array.isArray(spaces) ? spaces : []) {
      const key = 'w:' + String(space?.id ?? space?.path ?? workspaces.size)
      workspaces.set(key, { id: key, title: clip(space?.title || baseName(space?.path), 80) })
      for (const id of space?.sessionIds || []) if (!home.has(id)) home.set(id, key)
    }
    const titleOf = (value, depth = 0) => typeof value === 'string' ? value
      : value && typeof value === 'object' && depth < 3 ? titleOf(value.text ?? value.title ?? value.value, depth + 1) : ''
    const rows = []
    for (const record of corpus) {
      const header = record.header
      if (!header?.id) continue
      const id = header.id
      const values = attempt(() => cache?.cachedSnapshot?.(header, ['title', 'sessionListMetadata'])?.values, {})
      const meta = values?.sessionListMetadata || {}
      const feed = feeds.get(id)
      const created = Number(header.createdAt) || 0
      const last = feed?.source ? Number(feed.items.at(-1)?.time) || 0 : 0
      let workspace = home.get(id)
      if (!workspace) {
        const folder = baseName(header.cwd)
        workspace = 'c:' + folder
        if (!workspaces.has(workspace)) workspaces.set(workspace, { id: workspace, title: clip(folder, 80) })
      }
      rows.push({
        id,
        parent: sessionParent(record),
        created,
        updated: Math.max(created, Number(meta.lastPromptAt) || 0, Number(header.updatedAt) || 0, last),
        title: clip(titleOf(values?.title), 120),
        blank: typeof meta.blank === 'boolean' ? meta.blank : Boolean(feed?.source && !feed.items.length && !feed.firstPrompt),
        archived: archived.has(id),
        pinned: pinned.has(id),
        workspace,
        project: clip(baseName(header.cwd), 80),
      })
    }
    rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated)
    return { rows, byId: new Map(rows.map((row) => [row.id, row])), workspaces }
  }

  // Multi-session canvas: several sessions side by side on one page, each with
  // its own capabilities and the subagents it dispatched.
  async function canvasData(request, peer, browserPass) {
    if (!browserPass && denied(request, peer)) return json({ error: 'access_denied' }, 403)
    const query = new URL(request.url, 'http://localhost').searchParams
    const compact = Boolean(browserPass) || query.get('compact') === '1'
    const graphs = Boolean(browserPass) || (compact && query.get('graphs') === '1')
    const graphMode = graphs ? query.get('mode') : null
    const family = Boolean(browserPass) || (graphs && query.get('family') === '1')
    const inspected = query.get('inspect')
    const wanted = [...new Set((query.has('roots') ? query.get('roots').split(',') : browserPass?.roots || []).map((id) => id.trim()).filter(Boolean))]
      .slice(0, compact ? MAX_SESSIONS : MAX_ROOTS)
    try {
      const corpus = await ctx.sessionQuery.listSessions()
      const listed = new Map((corpus || []).filter((record) => record.header?.id)
        .map((record) => [record.header.id, record]))
      const initial = new Set(browserPass?.roots)
      const shown = wanted.filter((id) => {
        const record = listed.get(id)
        return record && (!browserPass || !sessionParent(record) || initial.has(id))
      })
      let omittedBranches = 0
      if (family) {
        const children = new Map()
        for (const [id, record] of listed) {
          const parent = sessionParent(record)
          if (!parent || parent === id) continue
          if (!children.has(parent)) children.set(parent, [])
          children.get(parent).push(id)
        }
        const visited = new Set(shown)
        for (const id of shown) {
          for (const child of children.get(id) || []) {
            if (visited.has(child)) continue
            visited.add(child)
            if (shown.length >= MAX_SESSIONS) { omittedBranches++; continue }
            shown.push(child)
          }
        }
      }
      let directory = sessionDirectory([...listed.values()])
      const selected = new Set(shown)
      const archivedShown = query.get('archived') === '1'
      const rail = directory.rows.filter((row) => !row.parent
        && (selected.has(row.id) || (!row.blank && (archivedShown || !row.archived))))
      const ids = [...new Set([...shown, ...rail.slice(0, MAX_LISTED).map((row) => row.id)])]
      const store = ctx.get('sessions')
      // Keep this canvas's selected feeds ahead of background picker reads.
      for (const id of shown) {
        const feed = feeds.get(id)
        if (feed) retain(feeds, id, feed)
      }
      for (const id of [...new Set([...shown, ...rail.slice(0, MAX_SESSIONS).map((row) => row.id)])]) {
        const feed = feeds.get(id)
        if (feed?.loading) continue
        const attached = store?.get(id)
        const changedSource = feed?.source && (attached ? feed.source !== attached : feed.source !== 'disk')
        if (attached || (selected.has(id) && (changedSource || !feed?.source))) {
          readFeed(id).catch(() => {})
        } else if ((!feed?.source || changedSource) && pickerReads.size < 4) {
          pickerReads.add(id)
          readFeed(id).catch(() => {}).finally(() => pickerReads.delete(id))
        }
      }
      // Live feeds fill in synchronously above; read their activity times again.
      directory = sessionDirectory([...listed.values()])
      const catalog = new Map()
      for (const id of ids) {
        for (const [childId, entry] of feeds.get(id)?.catalog ?? []) catalog.set(childId, entry.label)
      }
      const working = (id) => {
        const record = listed.get(id)
        const attached = Boolean(store?.get(id) || record?.live)
        if (!attached) return false
        const feed = feeds.get(id)
        if (feed?.source && feed.source !== 'disk') {
          return feed.pending.size > 0 || (live.get(id) ?? feed.phase.name !== 'idle')
        }
        return live.get(id) === true
      }
      const sessions = ids.map((id) => {
        const record = listed.get(id)
        const entry = directory.byId.get(id)
        const feed = feeds.get(id)
        const cached = cachedStats(id)
        return {
          id,
          parent: family ? sessionParent(record) : record.header.parentSession || null,
          created: entry.created,
          updated: entry.updated,
          live: record.live === true,
          project: entry.project,
          workspace: entry.workspace,
          archived: entry.archived,
          pinned: entry.pinned,
          // The sidebar's own title first, so both lists read the same.
          label: entry.title || catalog.get(id) || feed?.title || clip(feed?.firstPrompt, 120) || '',
          running: working(id),
          ready: Boolean(cached),
          ...(cached || {}),
          model: cached ? modelOf(feed).name : '',
        }
      })
      const used = new Set(sessions.map((row) => row.workspace))
      const workspaces = [...directory.workspaces.values()].filter((space) => used.has(space.id))
      const archivedCount = directory.rows.filter((row) => !row.parent && !row.blank && row.archived).length
      const roots = await Promise.all(shown.map(async (id) => {
        const feed = feeds.get(id)
        if (!feed?.source) return { id, ready: false }
        const map = aggregate(feed)
        const summary = {
          id,
          ready: true,
          parent: family ? sessionParent(listed.get(id)) : listed.get(id).header.parentSession || null,
          model: modelOf(feed).name,
          calls: map.calls,
          failures: map.failures,
          running: map.running,
          phase: working(id) ? map.phase : { name: 'idle' },
          usd: map.spend.usd,
          priced: map.spend.priced,
          unpriced: map.spend.unpriced,
        }
        if (compact && !graphs && inspected !== id) return summary
        const matching = graphMode === 'failed' ? map.nodes.filter((node) => node.failed)
          : graphMode === 'running' ? map.nodes.filter((node) => node.running) : map.nodes
        const rank = (dot) => graphMode === 'failed' ? Number(Boolean(dot.failed)) : Number(Boolean(dot.running))
        const nodes = matching.slice(0, 8).map(({ dots, ...node }) => ({
          ...node,
          dots: dots.slice().sort((a, b) => rank(b) - rank(a) || Number(Boolean(b.failed)) - Number(Boolean(a.failed))
            || b.seq - a.seq).slice(0, graphs && inspected !== id ? 5 : 12),
        }))
        const graph = {
          ...summary,
          active: map.active.map(({ seq, time, name, capId, dotId }) => ({ seq, time, name, capId, dotId })),
          nodeCount: map.nodes.length,
          ...(graphs ? { omittedCapabilities: Math.max(0, matching.length - nodes.length) } : {}),
          nodes,
          topSteps: map.topSteps,
        }
        if (graphs && inspected !== id) return graph
        let agents = []
        try {
          const lineage = await lineageFor(id)
          agents = lineage.rows.slice(1).filter((row) => !browserPass || shown.includes(row.id)).map((row) => ({
            id: row.id,
            label: row.label || catalog.get(row.id) || feeds.get(row.id)?.title || '',
            depth: row.depth,
            running: working(row.id),
            ...(cachedStats(row.id) || {}),
          }))
        } catch { /* an unreachable lineage keeps the session itself on the canvas */ }
        const failureSeqs = new Set(nodes.flatMap((node) => [node.failureSeq, ...node.dots.map((dot) => dot.failureSeq)]))
        return {
          ...graph,
          active: map.active,
          agents,
          recentFailures: feed.items.filter((item) => item.result?.status === 'failed').slice(-8).reverse()
            .map(({ seq, name, object, result }) => ({
              seq, name, capId: object?.cap.id, target: object?.label || '',
              error: result.error || result.text || '',
            })),
          ...(graphs ? {
            evidence: Object.fromEntries(feed.items.filter((item) => failureSeqs.has(item.seq))
              .map((item) => [item.seq, item.result.error || item.result.text || ''])),
          } : {}),
        }
      }))
      const data = { roots, sessions, workspaces, archivedCount, asOf: PRICING_AS_OF, ...(family ? { omittedBranches } : {}) }
      const version = createHash('sha256').update(JSON.stringify(data)).digest('hex')
      if (query.get('version') === version) return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } })
      return json({ ...data, version })
    } catch {
      return json({ error: 'session_unavailable' }, 503)
    }
  }

  async function viewData(kind, query) {
    const root = query.get('root')
    const focus = query.get('focus') || root
    if (!root || root.length > 180 || focus.length > 180) return json({ error: 'invalid_session' }, 400)
    for (const name of ['at', 'before', 'after']) {
      if (query.has(name) && !/^\d{1,15}$/.test(query.get(name))) return json({ error: 'invalid_cursor' }, 400)
    }
    try {
      const { rows, version: lineageVersion } = await lineageFor(root)
      if (!rows.some((row) => row.id === focus)) return json({ error: 'session_not_found' }, 404)
      const feed = await readFeed(focus)
      const catalog = (focus === root ? feed : feeds.get(root))?.catalog
      const { sessions, digest } = withStats(rows, catalog)
      const working = sessions.filter((row) => row.running).length
      const version = [epoch, feed.revision, lineageVersion, working, digest, kind, query.get('filter'), query.get('at'), query.get('before'), query.get('after')].join('-')
      if (query.get('version') === version) return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } })
      const data = kind === 'map' ? aggregate(feed) : timeline(feed, query)
      return json({ ...data, root, focus, sessions, working, version, partial: feed.start > feed.inherited, model: modelOf(feed) })
    } catch (error) {
      if (error?.code === 'SESSION_QUERY_SESSION_NOT_FOUND') return json({ error: 'session_not_found' }, 404)
      return json({ error: 'session_unavailable' }, 503)
    }
  }

  function view(kind) {
    return (request, peer) => {
      if (denied(request, peer)) return json({ error: 'access_denied' }, 403)
      return viewData(kind, new URL(request.url, 'http://localhost').searchParams)
    }
  }

  function html(content) {
    return new Response(content, {
      headers: {
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
      },
    })
  }

  // The former single-session page: links to it now open the canvas focused
  // on that session, so there is one interface instead of two.
  function legacyView(request, peer) {
    if (denied(request, peer)) return json({ error: 'access_denied' }, 403)
    const query = new URL(request.url, 'http://localhost').searchParams
    const root = query.get('root')
    const focus = query.get('focus') || root
    if (!root || root.length > 180 || focus.length > 180) return new Response('invalid session', { status: 400 })
    const next = new URLSearchParams({ focus: root })
    if (focus !== root) next.set('inspect', focus)
    for (const name of ['at', 'filter']) if (query.get(name)) next.set(name, query.get(name))
    return new Response(null, { status: 302, headers: { location: '/agent-workflow/canvas?' + next, 'cache-control': 'no-store' } })
  }

  function boardOrigin(request) {
    if (!LOOPBACK.test(ctx.webServer.host)) return null
    const boundOrigin = ctx.webServer.getOrigin?.()
    if (!boundOrigin) return null
    const address = new URL(boundOrigin)
    if (!LOOPBACK.test(address.hostname) || request.headers.get('host') !== address.host) return null
    return address.origin
  }

  function issuePass(data) {
    const now = Date.now()
    for (const [key, pass] of boardPasses) if (pass.expires <= now) boardPasses.delete(key)
    if (boardPasses.size >= BOARD_LIMIT) boardPasses.delete(boardPasses.keys().next().value)
    const key = randomBytes(32).toString('base64url')
    boardPasses.set(key, { ...data, expires: now + BOARD_TTL })
    return key
  }

  // A browser link for Harness Desktop, whose own window cannot share its
  // sign-in with the system browser. The key is short-lived and loopback-only.
  async function issueBoard(request, peer) {
    const origin = boardOrigin(request)
    // On older Harness versions raw webServer resources do not receive a Peer.
    // Use Connection's own admission check, never the loopback fallback.
    const admission = peer ?? ctx.get('connection')?.admit?.(request)?.peer
    if (!origin || !admission || request.headers.get('x-awv-detach') !== '1') return json({ error: 'access_denied' }, 403)
    const query = new URL(request.url).searchParams
    const focus = query.get('focus') || ''
    const roots = [...new Set((focus ? [focus] : (query.get('roots') || '').split(','))
      .map((id) => id.trim()).filter(Boolean))].slice(0, MAX_SESSIONS)
    if (roots.some((id) => id.length > 180)) return json({ error: 'invalid_session' }, 400)
    try {
      const records = (await ctx.sessionQuery.listSessions() || []).filter((record) => record.header?.id)
      const listed = new Set(records.map((record) => record.header.id))
      if (roots.some((id) => !listed.has(id))) return json({ error: 'session_not_found' }, 404)
      const key = issuePass({ roots })
      const hash = new URLSearchParams({ key, roots: roots.join(',') })
      if (focus) hash.set('focus', focus)
      if (['zh', 'en'].includes(query.get('lang'))) hash.set('lang', query.get('lang'))
      return json({ url: origin + '/agent-workflow/canvas-board#' + hash })
    } catch {
      return json({ error: 'session_unavailable' }, 503)
    }
  }

  function boardAccess(request) {
    const origin = boardOrigin(request)
    const source = request.headers.get('origin')
    const site = request.headers.get('sec-fetch-site')
    if (!origin || (source && source !== origin) || site === 'cross-site' || site === 'same-site') return json({ error: 'access_denied' }, 403)
    const key = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1]
    const pass = boardPasses.get(key)
    if (pass?.expires <= Date.now()) boardPasses.delete(key)
    if (!pass?.roots || pass.expires <= Date.now()) {
      return json({ error: 'board_expired' }, 401)
    }
    return pass
  }

  // The browser link shows the same information as the canvas inside Harness:
  // the key already limits it to this computer and to two hours.
  async function canvasBoardData(request) {
    const pass = boardAccess(request)
    if (pass instanceof Response) return pass
    return canvasData(request, null, pass)
  }

  async function canvasBoardSnapshot(request) {
    const pass = boardAccess(request)
    if (pass instanceof Response) return pass
    return viewData('timeline', new URL(request.url).searchParams)
  }

  for (const [name, resource] of [
    ['map', view('map')],
    ['snapshot', view('timeline')],
    ['overview', overviewResource],
    ['canvas-data', canvasData],
    ['canvas', () => html(canvasHtml())],
    ['view', legacyView],
    ['board-link', issueBoard],
    ['ping', () => json({ ok: true, plugin: 'agent-workflow-viewer' })],
  ]) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/agent-workflow/' + name, auth: 'required', resource }))
  }
  for (const [name, resource] of [
    ['canvas-board', (request) => boardOrigin(request) ? html(canvasHtml()) : json({ error: 'access_denied' }, 403)],
    ['canvas-board-data', canvasBoardData],
    ['canvas-board-snapshot', canvasBoardSnapshot],
  ]) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/agent-workflow/' + name, auth: 'anonymous', resource }))
  }
}
