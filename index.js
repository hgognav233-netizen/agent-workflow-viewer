/**
 * Fold the Harness session log once, then serve bounded views of that projection.
 */
import { randomBytes } from 'node:crypto'

export const inject = ['webServer', 'sessionQuery']

const BOARD_TTL = 2 * 60 * 60 * 1000
const BOARD_LIMIT = 24
const LOOPBACK = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i

const LOG_WINDOW = 3000
const TIMELINE_LIMIT = 400
const GRAPH_DOT_LIMIT = 96
const MAX_SESSIONS = 40
const LINEAGE_TTL = 4000
const FILE_TOOLS = new Set(['read', 'write', 'edit', 'read_image', 'glob', 'grep'])
const SHELL_TOOLS = new Set(['pwsh', 'bash', 'shell', 'exec_command'])
const AGENT_TOOLS = new Set(['subagent', 'spawn_teammate', 'workflow', 'send_message', 'interrupt_agent', 'list_agents', 'wait_agent', 'team_task_create', 'team_task_update'])
const zones = { web: 'web', file: 'disk', skill: 'disk', mcp: 'external' }

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
    modelEvents: [], modelName: '',
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
      if (!user) {
        const usage = data.usage || {}
        feed.modelEvents.push({ seq, input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 })
        const cost = requestCost(usage, feed.modelName, time)
        const prompt = (Number(usage.inputTokens) || 0) + (Number(usage.cacheReadTokens) || 0) + (Number(usage.cacheWriteTokens) || 0)
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
        const thinking = clip(blocks.filter((block) => block?.type === 'reasoning')
          .map((block) => block.text).join('\n\n'), 1600)
        if (thinking) add({ kind: 'thinking', text: thinking, step: data.step })
      }
      const text = clip(textOf(user ? data.content : data.message?.content), 1200)
      if (text) add({ kind: user ? 'user' : 'reply', text, step: data.step })
      feed.phase = { name: 'thinking', since: time, label: '' }
      break
    }
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
    .map(({ seq, time, usd, prompt, output, cache, peak, model }) => ({ seq, time, usd, prompt, output, cache, peak, model }))
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

// Standalone board served outside the conversation, in two modes.
// view: same-origin Harness session, full data and the same information the
//       conversation panel shows. board: detached window with a short-lived key
//       and the reduced summary payload.
function boardHtml(root, focus, detached = false) {
  const safe = JSON.stringify({ root, focus, detached }).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>工作流</title>
<style>
:root{color-scheme:light;--ink:#171717;--paper:#fdfdfb;--line:#e5e5e0;--guide:#d8d8d2;--soft:#5f5f5a;--mute:#7b7b76;--bad:#a33c47;--live:#1a7f4b;--chip:#f1f1ec;--card:#fff}
:root[data-theme=dark]{color-scheme:dark;--ink:#e8e6df;--paper:#151517;--line:#2b2b2f;--guide:#34343b;--soft:#9b9b93;--mute:#8d8d85;--bad:#e0798a;--live:#5fd08d;--chip:#222226;--card:#1d1d20}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--ink:#e8e6df;--paper:#151517;--line:#2b2b2f;--guide:#34343b;--soft:#9b9b93;--mute:#8d8d85;--bad:#e0798a;--live:#5fd08d;--chip:#222226;--card:#1d1d20}}
*{box-sizing:border-box}
body{margin:0;font:13px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink)}
header{padding:9px 14px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;background:var(--paper);z-index:6}
h1{font-size:15px;margin:0;letter-spacing:-.02em}
.phase{font:11px ui-monospace,monospace;display:inline-flex;gap:6px;align-items:center;color:var(--soft)}
.phase i{width:7px;height:7px;border-radius:50%;background:var(--guide);display:inline-block}
.phase.busy i{background:var(--live);animation:beat 1.4s ease-out infinite}
@keyframes beat{0%{box-shadow:0 0 0 0 rgba(26,127,75,.55)}100%{box-shadow:0 0 0 9px rgba(26,127,75,0)}}
.spacer{margin-left:auto}
.muted{color:var(--mute);font-size:12px}
button{font:inherit;color:inherit;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:3px 8px;cursor:pointer}
button:hover{border-color:var(--soft)}
button[aria-pressed=true]{background:var(--chip);border-color:var(--soft)}
#theme{min-width:32px;font-size:13px}
#sessions{font:12px ui-monospace,monospace;background:var(--paper);color:inherit;border:1px solid var(--line);border-radius:6px;padding:3px 6px;max-width:260px}
nav{display:flex;gap:2px;padding:6px 14px 0;border-bottom:1px solid var(--line);position:sticky;top:38px;background:var(--paper);z-index:5}
nav button{border:0;border-bottom:2px solid transparent;border-radius:0;padding:6px 10px;background:transparent;color:var(--soft)}
nav button[aria-pressed=true]{color:var(--ink);border-bottom-color:var(--ink);background:transparent}
main{display:grid;grid-template-columns:minmax(0,1fr) 296px;align-items:start}
@media (max-width:900px){main{grid-template-columns:minmax(0,1fr)}}
.pane{min-width:0;padding:12px 14px 24px}
aside{border-left:1px solid var(--line);padding:12px 14px 24px;position:sticky;top:75px;max-height:calc(100vh - 75px);overflow:auto}
@media (max-width:900px){aside{position:static;border-left:0;border-top:1px solid var(--line);max-height:none}}
h2{font-size:10px;letter-spacing:.1em;color:var(--mute);margin:12px 0 6px;text-transform:uppercase;font-weight:600}
aside h2:first-child{margin-top:0}
.metrics{display:flex;gap:6px;flex-wrap:wrap}
.metric{flex:1 1 30%;border:1px solid var(--line);border-radius:8px;padding:6px 8px}
.metric b{display:block;font:600 15px ui-monospace,monospace}
.metric span{font-size:10px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em}
.metric.bad b{color:var(--bad)}
.row{display:flex;gap:8px;align-items:baseline;padding:3px 0;border-bottom:1px dashed transparent}
.row.click{cursor:pointer}
.row.click:hover{border-bottom-color:var(--line)}
.row b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:58%}
.row span{margin-left:auto;color:var(--mute);font:11px ui-monospace,monospace;white-space:nowrap}
.maphead{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.zoom{display:inline-flex;gap:4px}
.plot{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--paper);touch-action:none;cursor:grab;padding:4px 6px}
.plot.dragging{cursor:grabbing}
.plot svg{display:block;width:100%;height:auto;transform-origin:0 0}
.dotlabel{fill:var(--ink);font:8px ui-monospace,monospace;paint-order:stroke;stroke:var(--paper);stroke-width:2.4;stroke-linejoin:round;pointer-events:none}
.hint{color:var(--mute);font-size:11px;margin-top:4px}
.live-wire{stroke:var(--live);stroke-dasharray:3 19;animation:flow 1.15s linear infinite}
.live-ring{transform-box:fill-box;transform-origin:center;animation:ping 1.45s ease-out infinite}
@keyframes flow{to{stroke-dashoffset:-44}}
@keyframes ping{from{transform:scale(.8);opacity:.85}to{transform:scale(2);opacity:0}}
.card{position:absolute;right:10px;top:10px;width:238px;background:var(--card);border:1px solid var(--soft);border-radius:8px;padding:9px 10px;box-shadow:0 8px 24px rgba(0,0,0,.14);font-size:12px}
.card.hidden{display:none}
.card h3{margin:0 0 4px;font-size:12px;overflow-wrap:anywhere}
.card dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:6px 0}
.card dt{color:var(--mute);font-size:11px}
.card dd{margin:0;font:11px ui-monospace,monospace;overflow-wrap:anywhere}
.card .acts{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.card button{font-size:11px;padding:2px 6px}
.filters{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.item{display:flex;gap:8px;align-items:baseline;padding:5px 6px;border-bottom:1px solid var(--line);font-size:12px;border-radius:6px}
.item.hit{background:var(--chip)}
.item .meta{flex:0 0 62px;font:10px ui-monospace,monospace;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}
.item .body{min-width:0;flex:1}
.item .body b{font-weight:600}
.item .tail{font:11px ui-monospace,monospace;color:var(--mute);white-space:nowrap}
.item .text{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.chip{display:inline-block;font:10px ui-monospace,monospace;border:1px solid var(--line);border-radius:99px;padding:0 6px;margin-left:6px;color:var(--mute)}
.chip.done{color:var(--soft)}
.chip.failed{color:var(--bad);border-color:var(--bad)}
.chip.running{color:var(--live);border-color:var(--live)}
.chip.interrupted{color:var(--mute)}
details summary{cursor:pointer;color:var(--mute);font-size:11px;margin-top:2px}
.turn{display:inline-block;width:3px;height:11px;background:var(--guide);margin-right:6px;vertical-align:-1px}
.pager{display:flex;gap:6px;align-items:center;margin-top:10px;flex-wrap:wrap}
.empty{color:var(--mute);font-size:12px;padding:6px 0}
body[data-mode=board] .view-only{display:none}
</style></head>
<body data-mode="view">
<header>
  <h1>工作流</h1>
  <span class="phase" id="phase"><i></i><em id="phasetext">连接中…</em></span>
  <span class="muted" id="model"></span>
  <span class="spacer"></span>
  <select id="sessions" class="view-only" hidden aria-label="选择会话"></select>
  <button id="theme" type="button" title="配色：跟随系统">◐</button>
</header>
<nav class="view-only" id="tabs" aria-label="视图">
  <button type="button" id="tab-map" aria-pressed="true">概览</button>
  <button type="button" id="tab-timeline" aria-pressed="false">时间线</button>
</nav>
<main>
  <div class="pane">
    <section id="pane-map">
      <div class="maphead">
        <h2 style="margin:12px 0 6px">能力图</h2>
        <div class="zoom">
          <button type="button" id="zoom-out" aria-label="缩小">−</button>
          <button type="button" id="zoom-in" aria-label="放大">+</button>
          <button type="button" id="zoom-reset">复位</button>
        </div>
      </div>
      <div class="plot" id="plot"><div class="empty">…</div>
        <div class="card hidden" id="card"></div>
      </div>
      <div class="hint">点小点看详情 · 拖动平移 · 滚轮缩放</div>
    </section>
    <section id="pane-timeline" class="view-only" hidden>
      <div class="filters" id="filters">
        <button type="button" data-filter="all" aria-pressed="true">全部</button>
        <button type="button" data-filter="tools" aria-pressed="false">工具</button>
        <button type="button" data-filter="thinking" aria-pressed="false">思考</button>
        <button type="button" data-filter="failed" aria-pressed="false">失败</button>
      </div>
      <div id="items"><div class="empty">…</div></div>
      <div class="pager" id="pager"></div>
    </section>
  </div>
  <aside>
    <div class="metrics" id="metrics"></div>
    <h2>正在执行</h2><div class="muted" id="active">无</div>
    <h2>能力</h2><div class="muted" id="caps">…</div>
    <h2>花费（估算）</h2><div id="spend">…</div>
    <h2 class="view-only" id="agentshead" hidden>子 Agent</h2><div class="view-only" id="agents" hidden></div>
  </aside>
</main>
<script>
var config = ${safe};
var MODE = config.detached ? 'board' : 'view';
var pass = MODE === 'board' ? new URLSearchParams(location.hash.slice(1)).get('key') : '';
document.body.setAttribute('data-mode', MODE);
var KIND = {
  web: '网页检索', file: '项目文件', skill: '技能', shell: '终端', agent: '子 Agent',
  memory: '历史会话', plan: '计划', plugin: '插件', tool: '工具', mcp: 'MCP 服务'
};
var ZONES = [
  { id: 'web', label: '云端' },
  { id: 'process', label: '本机进程' },
  { id: 'disk', label: '本机磁盘' },
  { id: 'external', label: '外部程序' }
];
var MODEL = { x: 36, y: 244 };
var state = {
  focus: config.focus || '',
  tab: 'map',
  filter: 'all',
  cursor: null,
  map: null,
  timeline: null,
  versions: {},
  zoom: { s: 1, x: 0, y: 0 },
  moved: false,
  expired: false
};
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
function ms(value) {
  if (!value) return '';
  return value >= 1000 ? (value / 1000).toFixed(1) + 's' : Math.round(value) + 'ms';
}
function statusChip(status) {
  var map = { done: '完成', failed: '失败', running: '运行中', interrupted: '中断' };
  return '<span class="chip ' + status + '">' + (map[status] || status) + '</span>';
}
/* ---------- colour scheme ---------- */
var THEMES = ['system', 'light', 'dark'];
var ICONS = { system: '◐', light: '☀', dark: '☾' };
var NAMES = { system: '跟随系统', light: '浅色', dark: '深色' };
var theme = 'system';
try { theme = localStorage.getItem('awv-theme') || localStorage.getItem('awv-board-theme') || 'system' } catch (error) { theme = 'system' }
function applyTheme(value) {
  theme = THEMES.indexOf(value) < 0 ? 'system' : value;
  var root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  byId('theme').textContent = ICONS[theme];
  byId('theme').title = '配色：' + NAMES[theme];
  try { localStorage.setItem('awv-theme', theme) } catch (error) { /* file: or private mode */ }
}
applyTheme(theme);
byId('theme').addEventListener('click', function () {
  applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
});
/* ---------- capability map ---------- */
function curvePath(from, to, bend) {
  var dx = to.x - from.x;
  return 'M' + from.x + ' ' + from.y + ' C' + (from.x + dx * .5) + ' ' + (from.y + bend)
    + ' ' + (to.x - dx * .36) + ' ' + to.y + ' ' + to.x + ' ' + to.y;
}
function layoutGraph(nodes) {
  var TOP = 24, DOT_X = 424, HEAD = 20, GAP = 7, FLOOR = 5, PITCH = 11;
  var BASE = 484, MAX = 1600;
  var lanes = ZONES.map(function (zone) {
    return {
      zone: zone,
      groups: nodes.filter(function (node) { return node.zone === zone.id })
        .slice(0, 8).sort(function (a, b) { return String(a.id).localeCompare(String(b.id)) })
    };
  });
  var totalGroups = lanes.reduce(function (sum, lane) { return sum + lane.groups.length }, 0);
  var all = lanes.reduce(function (sum, lane) {
    return sum + lane.groups.reduce(function (count, node) { return count + (node.dots || []).length }, 0);
  }, 0);
  var gaps = totalGroups * GAP;
  // Crowded maps grow taller so objects keep their names; past the cap, dots fold again.
  var natural = TOP + lanes.length * HEAD + gaps + all * PITCH + 24;
  var height = Math.min(MAX, Math.max(BASE, natural));
  var usable = height - TOP - lanes.length * HEAD - gaps;
  var perGroup = usable / Math.max(1, all) < FLOOR
    ? Math.max(1, Math.floor(usable / FLOOR / Math.max(1, totalGroups))) : Infinity;
  var drawn = lanes.reduce(function (sum, lane) {
    return sum + lane.groups.reduce(function (count, node) {
      return count + Math.min(perGroup, (node.dots || []).length);
    }, 0);
  }, 0);
  var pitch = Math.max(FLOOR, Math.min(PITCH, usable / Math.max(1, drawn)));
  var content = lanes.length * HEAD + gaps + drawn * pitch;
  var offset = Math.max(0, (height - TOP - content) / 2);
  var cursor = TOP + offset;
  var placed = lanes.map(function (lane, index) {
    var top = cursor;
    cursor += HEAD;
    var inner = cursor;
    var groups = lane.groups.map(function (node, order) {
      var shown = (node.dots || []).slice(0, perGroup);
      var span = Math.max(1, shown.length) * pitch;
      var hub = { x: 211 + ((order * 61 + index * 37) % 95), y: inner + span / 2 };
      var dots = shown.slice().sort(function (a, b) { return a.id - b.id }).map(function (dot, order) {
        return { dot: dot, x: DOT_X, y: inner + (order + .5) * pitch };
      });
      inner += span + GAP;
      return { node: node, hub: hub, dots: dots };
    });
    cursor = inner;
    return { top: top, label: lane.zone.label, count: lane.groups.length, groups: groups, pitch: pitch };
  });
  return { height: height, lanes: placed, center: TOP + offset + content / 2 };
}
function short(text, limit) {
  var chars = Array.from(String(text == null ? '' : text));
  return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join('');
}
function dotTitle(node, dot) {
  var parts = [dot.label || ('对象 #' + dot.id)];
  parts.push((dot.hits || 0) + ' 次');
  if (dot.failed) parts.push(dot.failed + ' 次失败');
  if (dot.callers && dot.callers.length) parts.push(dot.callers[0].name);
  return esc(parts.join(' · '));
}
function drawGraph(data) {
  var nodes = data.nodes || [];
  var plan = layoutGraph(nodes);
  var height = plan.height;
  var model = { x: 36, y: plan.center };
  var out = [];
  out.push('<svg viewBox="0 0 680 ' + height + '" role="img" aria-label="能力图">');
  [192, 208, 224, 240, 256, 272].forEach(function (x) {
    out.push('<line x1="' + x + '" x2="' + x + '" y1="18" y2="' + (height - 18) + '" stroke="var(--guide)" stroke-width=".5" stroke-dasharray="1 4"/>');
  });
  plan.lanes.forEach(function (zone) {
    var spacious = zone.pitch >= 8.5;
    out.push('<line x1="327" x2="655" y1="' + (zone.top + 16) + '" y2="' + (zone.top + 16) + '" stroke="var(--guide)" stroke-width=".5"/>');
    out.push('<text x="655" y="' + (zone.top + 12) + '" text-anchor="end" font-size="9" fill="var(--soft)">' + esc(zone.label + ' / ' + zone.count) + '</text>');
    zone.groups.forEach(function (group) {
      var bend = (group.hub.y - model.y) * .16;
      out.push('<path d="' + curvePath(model, group.hub, bend) + '" class="' + (group.node.running ? 'live-wire' : '') + '" fill="none" stroke="var(--ink)" stroke-width="' + (group.node.running ? 1.3 : .7) + '" opacity="' + (group.node.running ? .9 : .25) + '"/>');
      group.dots.forEach(function (entry) {
        var dot = entry.dot;
        var radius = Math.min(3.4, 1.9 + Math.log2((dot.hits || 1) + 1) * .55);
        out.push('<path d="' + curvePath(group.hub, entry, (entry.y - group.hub.y) * .16) + '" class="' + (dot.running ? 'live-wire' : '') + '" fill="none" stroke="var(--ink)" stroke-width=".5" opacity=".18"/>');
        if (dot.running) out.push('<circle cx="' + entry.x + '" cy="' + entry.y + '" r="' + (radius + 3) + '" fill="none" stroke="var(--live)" class="live-ring"/>');
        out.push('<circle cx="' + entry.x + '" cy="' + entry.y + '" r="' + radius + '" fill="' + (dot.failed ? 'var(--paper)' : 'var(--ink)') + '" stroke="' + (dot.failed ? 'var(--bad)' : 'none') + '" stroke-width="1" data-cap="' + esc(group.node.id) + '" data-dot="' + esc(dot.id) + '" style="cursor:pointer"><title>' + dotTitle(group.node, dot) + '</title></circle>');
        if (dot.label && (spacious || dot.running || dot.failed)) {
          out.push('<text class="dotlabel" x="' + (entry.x + 8) + '" y="' + (entry.y + 3) + '" font-size="8">' + esc(short(dot.label, 26)) + '</text>');
        }
      });
      out.push('<circle cx="' + group.hub.x + '" cy="' + group.hub.y + '" r="' + (3 + Math.min(4, Math.log2((group.node.count || 1) + 1))) + '" fill="var(--ink)" data-cap="' + esc(group.node.id) + '" style="cursor:pointer"><title>' + esc((group.node.label || group.node.id) + ' · ' + group.node.count + ' 个对象 · ' + group.node.hits + ' 次') + '</title></circle>');
      out.push('<text x="' + (group.hub.x + 9) + '" y="' + (group.hub.y - 6) + '" font-size="9.5" fill="var(--ink)">' + esc(group.node.label || group.node.id) + '</text>');
    });
  });
  out.push('<circle cx="' + model.x + '" cy="' + model.y + '" r="6" fill="var(--ink)"/>');
  out.push('<text x="' + model.x + '" y="' + (model.y + 20) + '" font-size="11" fill="var(--ink)">模型</text>');
  out.push('</svg>');
  var plot = byId('plot');
  var card = byId('card');
  plot.innerHTML = out.join('');
  plot.appendChild(card);
  setZoom(state.zoom, true);
}
function setZoom(next, force) {
  var svg = byId('plot').querySelector('svg');
  if (!svg) return;
  var limit = 4;
  var clamped = {
    s: Math.min(limit, Math.max(1, next.s)),
    x: next.x,
    y: next.y
  };
  if (clamped.s === 1) { clamped.x = 0; clamped.y = 0 }
  state.zoom = clamped;
  svg.style.transform = 'translate(' + clamped.x + 'px,' + clamped.y + 'px) scale(' + clamped.s + ')';
}
function zoomBy(factor, clientX, clientY) {
  var svg = byId('plot').querySelector('svg');
  if (!svg) return;
  var plot = byId('plot');
  var rect = plot.getBoundingClientRect();
  var next = Math.min(4, Math.max(1, state.zoom.s * factor));
  if (next === 1) { setZoom({ s: 1, x: 0, y: 0 }); return }
  if (clientX == null) {
    var midX = rect.width / 2, midY = rect.height / 2;
    var sx = (midX - state.zoom.x) / state.zoom.s;
    var sy = (midY - state.zoom.y) / state.zoom.s;
    setZoom({ s: next, x: midX - sx * next, y: midY - sy * next });
    return;
  }
  var px = clientX - rect.left, py = clientY - rect.top;
  var gx = (px - state.zoom.x) / state.zoom.s;
  var gy = (py - state.zoom.y) / state.zoom.s;
  setZoom({ s: next, x: px - gx * next, y: py - gy * next });
}
byId('zoom-in').addEventListener('click', function () { zoomBy(1.3) });
byId('zoom-out').addEventListener('click', function () { zoomBy(1 / 1.3) });
byId('zoom-reset').addEventListener('click', function () { setZoom({ s: 1, x: 0, y: 0 }) });
byId('plot').addEventListener('wheel', function (event) {
  event.preventDefault();
  zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
}, { passive: false });
byId('plot').addEventListener('pointerdown', function (event) {
  if (event.button !== 0) return;
  if (event.target.closest && event.target.closest('#card')) return;
  drag = { x: event.clientX, y: event.clientY, ox: state.zoom.x, oy: state.zoom.y };
  state.moved = false;
  byId('plot').classList.add('dragging');
});
var drag = null;
window.addEventListener('pointermove', function (event) {
  if (!drag) return;
  var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!state.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  state.moved = true;
  setZoom({ s: state.zoom.s, x: drag.ox + dx, y: drag.oy + dy });
});
window.addEventListener('pointerup', function () {
  drag = null;
  byId('plot').classList.remove('dragging');
});
byId('plot').addEventListener('click', function (event) {
  if (state.moved) { state.moved = false; return }
  var target = event.target;
  var host = target && target.closest ? target.closest('[data-cap]') : null;
  if (!host) { hideCard(); return }
  showCard(host.getAttribute('data-cap'), host.getAttribute('data-dot'));
});
/* ---------- object detail card ---------- */
function hideCard() {
  var card = byId('card');
  card.classList.add('hidden');
  card.innerHTML = '';
}
function showCard(capId, dotId) {
  var map = state.map;
  if (!map) return;
  var node = (map.nodes || []).filter(function (entry) { return entry.id === capId })[0];
  var dot = null;
  if (node && dotId) {
    dot = (node.dots || []).filter(function (entry) { return String(entry.id) === String(dotId) })[0];
  }
  if (!node) return;
  var rows = [];
  var title = dot ? (dot.label || ('对象 #' + dot.id)) : (node.label || node.id);
  rows.push('<dt>类别</dt><dd>' + esc(KIND[node.kind] || node.kind) + '</dd>');
  rows.push('<dt>区块</dt><dd>' + esc(node.zone) + '</dd>');
  if (dot) {
    rows.push('<dt>次数</dt><dd>' + fmt(dot.hits) + '</dd>');
    if (dot.failed) rows.push('<dt>失败</dt><dd>' + fmt(dot.failed) + '</dd>');
    if (dot.timed) rows.push('<dt>平均耗时</dt><dd>' + ms(dot.totalMs / dot.timed) + '</dd>');
    if (dot.caller) rows.push('<dt>来自工具</dt><dd>' + esc(dot.caller) + '</dd>');
    if (dot.detail) rows.push('<dt>位置</dt><dd>' + esc(dot.detail) + '</dd>');
    if (dot.seq != null) rows.push('<dt>首次出现</dt><dd>#' + esc(dot.seq) + '</dd>');
  } else {
    rows.push('<dt>对象数</dt><dd>' + fmt(node.count) + '</dd>');
    rows.push('<dt>总次数</dt><dd>' + fmt(node.hits) + '</dd>');
    if (node.failed) rows.push('<dt>失败</dt><dd>' + fmt(node.failed) + '</dd>');
    if (node.running) rows.push('<dt>运行中</dt><dd>' + fmt(node.running) + '</dd>');
  }
  var acts = [];
  if (MODE === 'view' && dot && dot.seq != null) {
    acts.push('<button type="button" data-act="open" data-seq="' + esc(dot.seq) + '">在时间线中查看</button>');
    if (dot.failureSeq != null) acts.push('<button type="button" data-act="fail" data-seq="' + esc(dot.failureSeq) + '">查看最近失败</button>');
  }
  var card = byId('card');
  card.innerHTML = '<h3>' + esc(title) + '</h3><dl>' + rows.join('') + '</dl>'
    + (acts.length ? '<div class="acts">' + acts.join('') + '</div>' : '')
    + '<div class="acts"><button type="button" data-act="close">关闭</button></div>';
  card.classList.remove('hidden');
  card.onclick = function (event) {
    var button = event.target.closest('[data-act]');
    if (!button) return;
    var act = button.getAttribute('data-act');
    if (act === 'close') { hideCard(); return }
    jumpTo(Number(button.getAttribute('data-seq')));
  };
}
/* ---------- panels ---------- */
function paintPhase() {
  var map = state.map;
  if (!map) return;
  var p = map.phase || { name: 'idle', since: 0, label: '' };
  var busy = p.name !== 'idle';
  var secs = busy ? Math.max(0, (Date.now() - p.since) / 1000) : 0;
  byId('phase').className = 'phase' + (busy ? ' busy' : '');
  byId('phasetext').textContent = !busy ? '空闲'
    : (p.name === 'calling' ? '执行中 ' + (p.label || '') : '思考中') + ' · ' + secs.toFixed(1) + 's';
}
function paintHeader(data) {
  var model = data.model || {};
  byId('model').textContent = (model.name || '') + (model.requests ? ' · ' + model.requests + ' 次响应' : '')
    + (data.working ? ' · 子会话在跑 ' + data.working : '');
  if (MODE === 'view') paintSessions(data);
}
function paintSessions(data) {
  var select = byId('sessions');
  var sessions = data.sessions || [];
  if (sessions.length < 2) { select.hidden = true; return }
  select.hidden = false;
  var current = state.focus || data.focus || config.focus || config.root;
  var html = sessions.map(function (session) {
    var label = (session.running ? '● ' : '') + (session.depth === 0
      ? '当前会话'
      : repeatDot(Math.min(session.depth, 6)) + ' ' + (session.label || String(session.id).slice(0, 8)));
    return '<option value="' + esc(session.id) + '"' + (session.id === current ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('');
  if (select.innerHTML !== html) select.innerHTML = html;
}
function repeatDot(n) {
  var out = '';
  for (var i = 0; i < n; i++) out += '·';
  return out;
}
function paintMap(data) {
  state.map = data;
  paintHeader(data);
  var model = data.model || {};
  byId('metrics').innerHTML = [
    '<div class="metric"><b>' + fmt(data.calls) + '</b><span>工具调用</span></div>',
    '<div class="metric' + (data.failures ? ' bad' : '') + '"><b>' + fmt(data.failures) + '</b><span>失败</span></div>',
    '<div class="metric"><b>' + fmt(data.running) + '</b><span>运行中</span></div>',
    '<div class="metric"><b>' + fmt(model.input) + ' / ' + fmt(model.output) + '</b><span>tokens 入/出</span></div>'
  ].join('');
  var active = data.active || [];
  byId('active').innerHTML = active.length ? active.map(function (call) {
    return '<div class="row' + (MODE === 'view' ? ' click' : '') + '"' + (MODE === 'view' ? ' data-seq="' + esc(call.seq) + '"' : '') + '>'
      + '<b>' + esc(call.name) + '</b><span>' + esc(call.summary || '') + '</span></div>';
  }).join('') : '<div class="empty">无</div>';
  var caps = (data.nodes || []).slice(0, 9);
  byId('caps').innerHTML = caps.length ? caps.map(function (node) {
    return '<div class="row click" data-cap-row="' + esc(node.id) + '"><b>' + esc(node.label || node.id) + '</b><span>'
      + node.count + ' 个对象 · ' + node.hits + ' 次' + (node.failed ? ' · 失败 ' + node.failed : '') + '</span></div>';
  }).join('') : '<div class="empty">…</div>';
  byId('active').onclick = function (event) {
    var row = event.target.closest('[data-seq]');
    if (row) jumpTo(Number(row.getAttribute('data-seq')));
  };
  byId('caps').onclick = function (event) {
    var row = event.target.closest('[data-cap-row]');
    if (row) showCard(row.getAttribute('data-cap-row'), null);
  };
  paintSpend(data);
  paintAgents(data);
  drawGraph(data);
  paintPhase();
}
function money(usd) {
  var value = Number(usd) || 0;
  if (value >= 1) return '$' + value.toFixed(2);
  if (value >= 0.01) return '$' + value.toFixed(3);
  return '$' + value.toFixed(4);
}
function paintSpend(data) {
  var spend = data.spend || {};
  var html = '<div class="row"><b>' + (spend.priced ? money(spend.usd) : '—') + '</b><span>'
    + fmt(spend.requests) + ' 次请求' + (spend.unpriced ? ' · ' + spend.unpriced + ' 次未计价' : '') + '</span></div>';
  var steps = data.topSteps || [];
  if (steps.length) {
    html += steps.map(function (step, index) {
      return '<div class="row click" data-seq="' + esc(step.seq) + '"><b>' + (index + 1) + '. ' + money(step.usd)
        + (step.peak ? ' · 峰' : ' · 谷') + '</b><span>入 ' + fmt(step.prompt) + ' / 出 ' + fmt(step.output) + ' · #' + esc(step.seq) + '</span></div>';
    }).join('');
  } else {
    html += '<div class="empty">没有可计价的请求</div>';
  }
  html += '<div class="hint">按官方 API 价目估算（' + esc(spend.asOf || '') + '，峰谷价），非账单</div>';
  byId('spend').innerHTML = html;
  byId('spend').onclick = function (event) {
    var row = event.target.closest('[data-seq]');
    if (row) jumpTo(Number(row.getAttribute('data-seq')));
  };
}
function paintAgents(data) {
  if (MODE !== 'view') return;
  var sessions = data.sessions || [];
  var head = byId('agentshead');
  var box = byId('agents');
  if (sessions.length < 2) { head.hidden = true; box.hidden = true; return }
  head.hidden = false;
  box.hidden = false;
  box.innerHTML = sessions.map(function (session) {
    var indent = session.depth === 0 ? '' : repeatDot(Math.min(session.depth, 6)) + ' ';
    var label = session.depth === 0 ? '当前会话' : (session.label || String(session.id).slice(0, 8));
    return '<div class="row"><b>' + (session.running ? '● ' : '') + esc(indent + label) + '</b><span>'
      + fmt(session.calls || 0) + ' 调用 · ' + (session.priced ? money(session.usd) : '—') + '</span></div>';
  }).join('');
}
function timelineRow(item) {
  var at = ' data-seq-row="' + esc(item.seq) + '"';
  if (item.kind === 'thinking') {
    return '<div class="item"' + at + '><span class="meta">思考</span><div class="body">'
      + '<details open><summary>推理过程' + (item.step != null ? ' · 第 ' + esc(item.step) + ' 步' : '') + '</summary>'
      + '<div class="text">' + esc(item.text || '') + '</div></details></div>'
      + '<span class="tail">#' + esc(item.seq) + '</span></div>';
  }
  if (item.kind === 'turn') {
    var started = item.phase === 'start';
    return '<div class="item"' + at + '><span class="meta">' + (started ? '开始' : '结束') + '</span><div class="body">'
      + '<span class="turn"></span><b>轮次 ' + esc(item.turn == null ? '' : item.turn) + '</b>'
      + (item.reason ? '<span class="chip">' + esc(item.reason) + '</span>' : '') + '</div>'
      + '<span class="tail">#' + esc(item.seq) + '</span></div>';
  }
  if (item.kind === 'user' || item.kind === 'reply') {
    var who = item.kind === 'user' ? '你' : '模型回复';
    return '<div class="item"' + at + '><span class="meta">' + esc(who) + '</span><div class="body">'
      + '<div class="text">' + esc(item.text || '') + '</div></div>'
      + '<span class="tail">#' + esc(item.seq) + '</span></div>';
  }
  if (item.kind === 'result') {
    var status = item.result ? item.result.status : '';
    return '<div class="item"' + at + '><span class="meta">结果</span><div class="body">'
      + '<b>' + esc(item.name || '') + '</b>' + statusChip(status)
      + (item.result && item.result.text ? '<details><summary>结果摘要</summary><div class="text">' + esc(item.result.text) + '</div></details>' : '')
      + (item.result && item.result.error ? '<div class="text muted">' + esc(item.result.error) + '</div>' : '')
      + '</div><span class="tail">#' + esc(item.seq) + '</span></div>';
  }
  var state2 = item.result ? item.result.status : 'running';
  var took = item.result && item.result.time ? ms(item.result.time - item.time) : '';
  return '<div class="item"' + at + '><span class="meta">工具</span><div class="body">'
    + '<b>' + esc(item.name || '') + '</b>' + statusChip(state2)
    + (item.summary ? '<div class="text muted">' + esc(item.summary) + '</div>' : '')
    + (item.result && item.result.text ? '<details><summary>结果摘要</summary><div class="text">' + esc(item.result.text) + '</div></details>' : '')
    + (item.result && item.result.error ? '<div class="text muted">' + esc(item.result.error) + '</div>' : '')
    + '</div><span class="tail">' + esc(took) + ' #' + esc(item.seq) + '</span></div>';
}
function highlightRow(seq) {
  var row = byId('items').querySelector('[data-seq-row="' + seq + '"]');
  if (!row) return;
  row.classList.add('hit');
  row.scrollIntoView({ block: 'center' });
  setTimeout(function () { row.classList.remove('hit') }, 1800);
}
function paintTimeline(data) {
  state.timeline = data;
  paintHeader(data);
  var items = data.items || [];
  byId('items').innerHTML = items.length ? items.map(timelineRow).join('')
    : '<div class="empty">' + (data.missing ? '这一条已经不在窗口里了' : '没有符合条件的记录') + '</div>';
  if (state.cursor && state.cursor.key === 'at') highlightRow(state.cursor.value);
  var pager = [];
  if (data.older != null) pager.push('<button type="button" data-cursor="before" data-value="' + esc(data.older) + '">更早</button>');
  if (data.newer != null) pager.push('<button type="button" data-cursor="after" data-value="' + esc(data.newer) + '">更新</button>');
  if (state.cursor) pager.push('<button type="button" data-cursor="latest">最新</button>');
  pager.push('<span class="muted">' + (items.length ? '显示 ' + items.length + ' 条' : '') + '</span>');
  byId('pager').innerHTML = pager.join('');
}
/* ---------- data ---------- */
function fetchJson(path, query) {
  var headers = { accept: 'application/json' };
  if (pass) headers.authorization = 'Bearer ' + pass;
  var url = './' + path + '?' + new URLSearchParams(query).toString();
  return fetch(url, { headers: headers }).then(function (response) {
    if (response.status === 204) return null;
    if (response.status === 401 && MODE === 'board') {
      expire();
      return false;
    }
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  });
}
function expire() {
  state.expired = true;
  byId('phase').className = 'phase';
  byId('phasetext').textContent = '链接已失效，请从 DSH 重新打开';
  ['model', 'metrics', 'active', 'caps'].forEach(function (id) {
    var node = byId(id);
    if (node) node.textContent = '';
  });
  byId('plot').innerHTML = '<div class="empty">链接已失效</div>';
}
function mapQuery() {
  var query = { version: state.versions.map || '' };
  if (MODE === 'view') { query.root = config.root; query.focus = state.focus || config.focus }
  return query;
}
function timelineQuery() {
  var query = { version: state.versions.timeline || '', filter: state.filter };
  if (MODE === 'view') { query.root = config.root; query.focus = state.focus || config.focus }
  if (state.cursor) query[state.cursor.key] = state.cursor.value;
  return query;
}
function fetchMap() {
  if (state.expired) return Promise.resolve();
  return fetchJson(MODE === 'board' ? 'board-data' : 'map', mapQuery()).then(function (data) {
    if (!data) return;
    state.versions.map = data.version || '';
    if (MODE === 'view' && data.focus) state.focus = data.focus;
    paintMap(data);
  }).catch(function (error) {
    byId('model').textContent = '读取失败 ' + error.message;
  });
}
function fetchTimeline() {
  if (state.expired || MODE !== 'view') return Promise.resolve();
  return fetchJson('snapshot', timelineQuery()).then(function (data) {
    if (!data) return;
    state.versions.timeline = data.version || '';
    paintTimeline(data);
  }).catch(function (error) {
    byId('items').innerHTML = '<div class="empty">读取失败 ' + esc(error.message) + '</div>';
  });
}
function tick() {
  if (document.hidden) { setTimeout(tick, 1200); return }
  var jobs = [fetchMap()];
  if (MODE === 'view' && state.tab === 'timeline') jobs.push(fetchTimeline());
  Promise.all(jobs).then(function () { setTimeout(tick, 1200) }, function () { setTimeout(tick, 1200) });
}
/* ---------- navigation ---------- */
function setTab(name) {
  state.tab = name;
  byId('tab-map').setAttribute('aria-pressed', String(name === 'map'));
  byId('tab-timeline').setAttribute('aria-pressed', String(name === 'timeline'));
  byId('pane-map').hidden = name !== 'map';
  byId('pane-timeline').hidden = name !== 'timeline';
  if (name === 'timeline') fetchTimeline();
}
function jumpTo(seq) {
  if (MODE !== 'view' || seq == null || isNaN(seq)) return;
  state.cursor = { key: 'at', value: seq };
  state.versions.timeline = '';
  setTab('timeline');
}
if (MODE === 'view') {
  byId('tab-map').addEventListener('click', function () { setTab('map') });
  byId('tab-timeline').addEventListener('click', function () { setTab('timeline') });
  byId('filters').addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.getAttribute('data-filter');
    state.cursor = null;
    state.versions.timeline = '';
    Array.prototype.forEach.call(byId('filters').children, function (child) {
      child.setAttribute('aria-pressed', String(child === button));
    });
    fetchTimeline();
  });
  byId('pager').addEventListener('click', function (event) {
    var button = event.target.closest('[data-cursor]');
    if (!button) return;
    var key = button.getAttribute('data-cursor');
    state.cursor = key === 'latest' ? null : { key: key, value: button.getAttribute('data-value') };
    state.versions.timeline = '';
    fetchTimeline();
  });
  byId('sessions').addEventListener('change', function (event) {
    state.focus = event.target.value;
    state.versions = {};
    state.cursor = null;
    fetchMap();
    if (state.tab === 'timeline') fetchTimeline();
  });
}
setInterval(function () { if (!document.hidden) paintPhase() }, 250);
tick();
</script></body></html>`
}

export function apply(ctx) {
  const feeds = new Map()
  // Live running state per session, so a busy subagent is visible from the root view.
  const live = new Map()
  const lineages = new Map()
  const boardPasses = new Map()
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
    if (!feed || feed.loading || !feed.source) return null
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

  function board(request, peer) {
    if (denied(request, peer)) return json({ error: 'access_denied' }, 403)
    const query = new URL(request.url, 'http://localhost').searchParams
    const root = query.get('root')
    const focus = query.get('focus') || root
    if (!root || root.length > 180) return new Response('invalid session', { status: 400 })
    return html(boardHtml(root, focus))
  }

  function boardOrigin(request) {
    if (!LOOPBACK.test(ctx.webServer.host)) return null
    const boundOrigin = ctx.webServer.getOrigin?.()
    if (!boundOrigin) return null
    const address = new URL(boundOrigin)
    if (!LOOPBACK.test(address.hostname) || request.headers.get('host') !== address.host) return null
    return address.origin
  }

  async function issueBoard(request, peer) {
    const origin = boardOrigin(request)
    // On older Harness versions raw webServer resources do not receive a Peer.
    // Use Connection's own admission check, never the loopback fallback.
    const admission = peer ?? ctx.get('connection')?.admit?.(request)?.peer
    if (!origin || !admission || request.headers.get('x-awv-detach') !== '1') return json({ error: 'access_denied' }, 403)
    const query = new URL(request.url).searchParams
    const root = query.get('root')
    const focus = query.get('focus') || root
    if (!root || root.length > 180 || focus.length > 180) return json({ error: 'invalid_session' }, 400)
    try {
      const { rows } = await lineageFor(root)
      if (!rows.some((row) => row.id === focus)) return json({ error: 'session_not_found' }, 404)
      const now = Date.now()
      for (const [key, pass] of boardPasses) if (pass.expires <= now) boardPasses.delete(key)
      if (boardPasses.size >= BOARD_LIMIT) boardPasses.delete(boardPasses.keys().next().value)
      const key = randomBytes(32).toString('base64url')
      boardPasses.set(key, { focus, expires: now + BOARD_TTL })
      return json({ url: origin + '/agent-workflow/board#key=' + key })
    } catch {
      return json({ error: 'session_unavailable' }, 503)
    }
  }

  async function boardData(request) {
    const origin = boardOrigin(request)
    const source = request.headers.get('origin')
    const site = request.headers.get('sec-fetch-site')
    if (!origin || (source && source !== origin) || site === 'cross-site' || site === 'same-site') return json({ error: 'access_denied' }, 403)
    const key = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1]
    const pass = boardPasses.get(key)
    if (!pass || pass.expires <= Date.now()) {
      if (pass) boardPasses.delete(key)
      return json({ error: 'board_expired' }, 401)
    }
    try {
      const feed = await readFeed(pass.focus)
      const version = epoch + '-' + feed.revision
      if (new URL(request.url).searchParams.get('version') === version) {
        return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } })
      }
      const { calls, failures, running, phase, active, nodes, spend, topSteps } = aggregate(feed)
      return json({
        version, calls, failures, running, phase, model: modelOf(feed), spend, topSteps,
        active: active.map(({ name, time }) => ({ name, time })),
        nodes: nodes.slice(0, 9).map(({ id, label, kind, zone, count, hits, failed, running, usd, dots }) => ({
          id, label, kind, zone, count, hits, failed, running, usd,
          dots: dots.slice(0, 24).map((dot) => ({ id: dot.id, hits: dot.hits, failed: dot.failed, running: dot.running })),
        })),
      })
    } catch {
      return json({ error: 'session_unavailable' }, 503)
    }
  }

  for (const [name, resource] of [
    ['map', view('map')],
    ['snapshot', view('timeline')],
    ['view', board],
    ['board-link', issueBoard],
    ['ping', () => json({ ok: true, plugin: 'agent-workflow-viewer' })],
  ]) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/agent-workflow/' + name, auth: 'required', resource }))
  }
  for (const [name, resource] of [
    ['board', (request) => boardOrigin(request) ? html(boardHtml('', '', true)) : json({ error: 'access_denied' }, 403)],
    ['board-data', boardData],
  ]) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/agent-workflow/' + name, auth: 'anonymous', resource }))
  }
}
