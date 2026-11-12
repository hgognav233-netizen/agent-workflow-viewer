/**
 * Host half of the workflow viewer.
 *
 * Folds each session log into a compact activity feed (prompt, reply, tool call, tool
 * result, turn boundary) and serves the feed plus the session lineage tree over two
 * read-only HTTP routes. The browser half polls them; nothing is written to the log.
 */

export const inject = ['webServer', 'sessionQuery']

/** How many feed entries one response carries (the tail). */
const ITEMS_SENT = 400
/** How many feed entries a session may keep in memory. */
const ITEMS_KEPT = 3000
const GRAPH_TTL = 700
const TITLE_TTL = 5000
const LABEL_TTL = 3000
/** Events folded on the first read of an existing long log. */
const INITIAL_FOLD = 1500

const DISPATCH_TOOLS = new Set([
  'subagent',
  'spawn_teammate',
  'workflow',
  'wait_agent',
  'list_agents',
])

const MESSAGE_TOOLS = new Set(['send_message', 'interrupt_agent', 'team_task_create', 'team_task_update'])

export function apply(ctx) {
  /** sessionId -> { lastSeq, items, byCall, cold } */
  const stores = new Map()
  /** sessionId -> true when running */
  const agentRunning = new Map()
  /** sessionId -> { at, title } */
  const titles = new Map()
  /** parentSessionId -> { at, rows } */
  const labelRows = new Map()
  /** rootSessionId -> { at, nodes } */
  const graphCache = new Map()

  ctx.on('agent/status', (payload) => {
    const agent = payload && payload.agent
    if (agent && typeof agent.id === 'string') {
      agentRunning.set(agent.id, payload.status === 'running')
    }
  })

  ctx.on('agent/disposed', (payload) => {
    const agent = payload && payload.agent
    if (agent && typeof agent.id === 'string') agentRunning.delete(agent.id)
  })

  // ---------------------------------------------------------------- folding

  function textOf(content) {
    if (!Array.isArray(content)) {
      if (typeof content === 'string') return content
      return ''
    }
    const parts = []
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
    return parts.join('\n')
  }

  function clip(value, max) {
    const text = String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim()
    if (text.length <= max) return text
    return text.slice(0, max - 1) + '…'
  }

  function summarizeArgs(raw) {
    let args = raw
    if (typeof raw === 'string') {
      try {
        args = JSON.parse(raw)
      } catch {
        args = null
      }
    }
    if (!args || typeof args !== 'object') return clip(raw, 180)
    const preferred = [
      'description', 'prompt', 'command', 'query', 'path', 'file_path', 'pattern',
      'url', 'label', 'name', 'target', 'message', 'content', 'skill', 'task', 'reason',
    ]
    const found = []
    for (const key of preferred) {
      const value = args[key]
      if (typeof value === 'string' && value.trim()) found.push(value)
      if (found.length >= 2) break
    }
    if (!found.length) {
      for (const key of Object.keys(args)) {
        const value = args[key]
        if (typeof value === 'string' && value.trim()) found.push(value)
        if (found.length >= 2) break
      }
    }
    if (!found.length) return clip(JSON.stringify(args), 180)
    return clip(found.join(' · '), 180)
  }

  function store(sessionId) {
    let store = stores.get(sessionId)
    if (!store) {
      store = {
        lastSeq: -1,
        items: [],
        byCall: new Map(),
        cold: false,
        provider: '',
        model: '',
        contextWindow: 0,
        tokensIn: 0,
        tokensOut: 0,
        requests: 0,
        turns: 0,
      }
      stores.set(sessionId, store)
    }
    return store
  }

  function fold(store, event) {
    const data = (event && event.data) || {}
    const time = (event && event.time) || 0
    const seq = event && event.seq
    switch (event.type) {
      case 'user/message': {
        const text = textOf(data.content)
        if (text) store.items.push({ kind: 'user', seq, time, text: clip(text, 1200) })
        break
      }
      case 'request/context': {
        if (data.provider) store.provider = String(data.provider)
        if (data.model) store.model = String(data.model)
        if (typeof data.contextWindow === 'number') store.contextWindow = data.contextWindow
        break
      }
      case 'request/header': {
        const config = (data.header && data.header.config) || {}
        if (config.provider) store.provider = String(config.provider)
        if (config.model) store.model = String(config.model)
        break
      }
      case 'assistant/message': {
        store.requests += 1
        const usage = data.usage
        if (usage) {
          if (typeof usage.inputTokens === 'number') store.tokensIn += usage.inputTokens
          if (typeof usage.outputTokens === 'number') store.tokensOut += usage.outputTokens
        }
        const message = data.message || {}
        const text = textOf(message.content)
        if (!text) break
        store.items.push({
          kind: 'reply',
          seq,
          time,
          text: clip(text, 1200),
          tokens: usage && typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined,
        })
        break
      }
      case 'tool/call': {
        const name = String(data.name || 'tool')
        const item = {
          kind: 'call',
          seq,
          time,
          id: String(data.callId || ''),
          name,
          args: summarizeArgs(data.arguments),
          raw: typeof data.arguments === 'string' ? data.arguments.slice(0, 2000) : '',
          hint: DISPATCH_TOOLS.has(name) ? 'dispatch' : MESSAGE_TOOLS.has(name) ? 'message' : '',
        }
        store.items.push(item)
        if (item.id) store.byCall.set(item.id, item)
        break
      }
      case 'tool/result': {
        const message = data.message || {}
        const callId = String(message.toolCallId || '')
        const ok = !message.isError
        const text = clip(textOf(message.content), 700)
        let err = ''
        if (data.error) {
          err = String(data.error.name || 'error')
          if (data.error.reason) err += ': ' + clip(data.error.reason, 160)
          else if (data.error.code) err += ': ' + data.error.code
        }
        const target = callId ? store.byCall.get(callId) : undefined
        if (target) {
          target.res = { ok, text, err, time }
        } else {
          store.items.push({ kind: 'result', seq, time, ok, text, err })
        }
        break
      }
      case 'turn/start': {
        store.turns += 1
        store.items.push({ kind: 'turn', seq, time, turn: data.turn, phase: 'start' })
        break
      }
      case 'turn/end': {
        const reason = (data.reason && data.reason.kind) || 'completed'
        store.items.push({ kind: 'turn', seq, time, turn: data.turn, phase: 'end', reason })
        break
      }
      default:
        return
    }
    if (store.items.length > ITEMS_KEPT) {
      const dropped = store.items.splice(0, store.items.length - ITEMS_KEPT)
      for (const droppedItem of dropped) {
        if (droppedItem && droppedItem.id) store.byCall.delete(droppedItem.id)
      }
    }
  }

  async function ensureFeed(sessionId) {
    const feed = store(sessionId)
    const sessions = ctx.get('sessions')
    const live = sessions ? sessions.get(sessionId) : undefined
    if (live) {
      const end = typeof live.seq === 'number' ? live.seq : 0
      if (end > feed.lastSeq + 1) {
        let from = feed.lastSeq + 1
        // A first read of a long log only folds a bounded tail; the head is history.
        if (from === 0 && end > INITIAL_FOLD) from = end - INITIAL_FOLD
        let events = []
        try {
          events = live.snapshotEvents(from, end)
        } catch (first) {
          try {
            events = live.ownEvents ? live.ownEvents().slice(from) : []
          } catch {
            events = []
          }
        }
        for (const event of events) fold(feed, event)
        feed.lastSeq = end - 1
      }
      return feed
    }
    if (!feed.cold) {
      feed.cold = true
      try {
        const snapshot = await ctx.sessionQuery.readSession(sessionId)
        const events = (snapshot && snapshot.events) || []
        for (const event of events) fold(feed, event)
        const last = events.length ? events[events.length - 1] : undefined
        feed.lastSeq = last && typeof last.seq === 'number' ? last.seq : -1
      } catch {
        feed.lastSeq = -1
      }
    }
    return feed
  }

  function currentOf(store) {
    for (let index = store.items.length - 1; index >= 0; index -= 1) {
      const item = store.items[index]
      if (!item) continue
      if (item.kind === 'call') {
        if (!item.res) return { kind: 'tool', text: item.name }
        return { kind: 'idle', text: '' }
      }
      if (item.kind === 'turn') {
        if (item.phase === 'start') return { kind: 'thinking', text: '' }
        return { kind: 'idle', text: '' }
      }
      if (item.kind === 'user') return { kind: 'thinking', text: '' }
      if (item.kind === 'reply') return { kind: 'idle', text: '' }
      if (item.kind === 'result') return { kind: 'idle', text: '' }
    }
    return { kind: 'idle', text: '' }
  }

  // ------------------------------------------------------------------ graph

  async function labelsFor(parentId) {
    const cached = labelRows.get(parentId)
    if (cached && Date.now() - cached.at < LABEL_TTL) return cached.rows
    const subagents = ctx.get('subagents')
    if (!subagents || typeof subagents.listChildren !== 'function') return new Map()
    try {
      const children = await subagents.listChildren(parentId)
      const rows = new Map()
      for (const child of children || []) {
        if (!child || typeof child.id !== 'string') continue
        rows.set(child.id, {
          label: typeof child.label === 'string' ? child.label : '',
          mode: typeof child.mode === 'string' ? child.mode : '',
        })
      }
      labelRows.set(parentId, { at: Date.now(), rows })
      return rows
    } catch {
      return new Map()
    }
  }

  async function titleFor(sessionId) {
    const cached = titles.get(sessionId)
    if (cached && Date.now() - cached.at < TITLE_TTL) return cached.title
    let title = ''
    try {
      const result = await ctx.sessionQuery.readTitle(sessionId)
      if (result && result.title) title = String(result.title.title || '')
    } catch {
      title = ''
    }
    titles.set(sessionId, { at: Date.now(), title })
    return title
  }

  function flatten(trace) {
    const rows = []
    const push = (record, depth, parentId) => {
      if (!record || !record.header) return
      rows.push({ record, depth, parentId })
    }
    push(trace.target, 0, (trace.target.header && trace.target.header.parentSession) || null)
    const walk = (nodes, depth) => {
      for (const node of nodes || []) {
        if (!node || !node.session) continue
        push(node.session, depth, (node.session.header && node.session.header.parentSession) || null)
        walk(node.descendants, depth + 1)
      }
    }
    walk(trace.descendants, 1)
    return rows
  }

  async function nodesFor(rootId) {
    let trace
    try {
      trace = await ctx.sessionQuery.traceSession(rootId)
    } catch (error) {
      return { nodes: [], error: clip(error && error.message ? error.message : error, 300) }
    }
    const rows = flatten(trace)
    const nodes = []
    const labelCache = new Map()
    for (const row of rows) {
      const header = row.record.header || {}
      const id = String(header.id || '')
      if (!id) continue
      let label = ''
      let mode = ''
      const parentId = row.parentId ? String(row.parentId) : null
      if (parentId) {
        if (!labelCache.has(parentId)) labelCache.set(parentId, await labelsFor(parentId))
        const entry = labelCache.get(parentId).get(id)
        if (entry) {
          label = entry.label
          mode = entry.mode
        }
      }
      const store = await ensureFeed(id)
      const agents = ctx.get('agents')
      const liveAgent = agents && typeof agents.get === 'function' ? agents.get(id) : undefined
      const running = agentRunning.get(id) === true
      let tools = 0
      let errors = 0
      for (const item of store.items) {
        if (item.kind === 'call') {
          tools += 1
          if (item.res && !item.res.ok) errors += 1
        }
      }
      nodes.push({
        id,
        parentId,
        depth: row.depth,
        label,
        mode,
        title: id === rootId ? await titleFor(id) : '',
        preset: header.agentPreset ? String(header.agentPreset) : '',
        origin: header.origin === 'subagent' ? 'subagent' : 'root',
        created: typeof header.createdAt === 'number' ? header.createdAt : 0,
        live: row.record.live === true,
        alive: Boolean(liveAgent) || running,
        status: running ? 'running' : 'idle',
        current: currentOf(store),
        tools,
        errors,
        lastTime: store.items.length ? store.items[store.items.length - 1].time || 0 : 0,
      })
    }
    return { nodes, error: '' }
  }

  async function graph(rootId) {
    const cached = graphCache.get(rootId)
    if (cached && Date.now() - cached.at < GRAPH_TTL) return cached.value
    const value = await nodesFor(rootId)
    graphCache.set(rootId, { at: Date.now(), value })
    return value
  }

  // ------------------------------------------------------------------- http

  // ---------------------------------------------------------- capability map

  function parseArgs(raw) {
    if (typeof raw !== 'string' || !raw) return null
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  function fileCategory(value) {
    const path = String(value || '').replace(/\//g, '\\')
    const lower = path.toLowerCase()
    const clipped = clip(path, 90)
    const shared = lower.match(/^[a-z]:\\users\\[^\\]+\\(\.agents|\.dsh|\.claude|appdata)\\/)
    if (shared) {
      const key = shared[1]
      const label =
        key === '.agents'
          ? '技能/规则库 .agents'
          : key === '.dsh'
            ? 'Harness 配置 .dsh'
            : key === '.claude'
              ? 'Claude 配置 .claude'
              : '程序目录 AppData'
      return { id: 'files:' + key, kind: 'file', label, sub: clipped }
    }
    if (lower.indexOf('d:\\ai\\lab') === 0) return { id: 'files:lab', kind: 'file', label: '实验区 D:\\AI\\lab', sub: clipped }
    if (lower.indexOf('d:\\ai\\tools') === 0) return { id: 'files:tools', kind: 'file', label: '工具 D:\\AI\\tools', sub: clipped }
    if (lower.indexOf('d:\\ai\\library') === 0) return { id: 'files:library', kind: 'file', label: '资料 D:\\AI\\library', sub: clipped }
    if (lower.indexOf('d:\\ai') === 0) return { id: 'files:ai', kind: 'file', label: '工作区 D:\\AI', sub: clipped }
    if (lower.indexOf('d:\\') === 0) return { id: 'files:d', kind: 'file', label: 'D 盘其他', sub: clipped }
    if (lower.indexOf('c:\\') === 0) return { id: 'files:c', kind: 'file', label: 'C 盘其他', sub: clipped }
    if (!path) return { id: 'files:none', kind: 'file', label: '本机文件', sub: '未带路径' }
    return { id: 'files:other', kind: 'file', label: '其他文件', sub: clipped }
  }

  function capabilityOf(item) {
    const name = String(item.name || 'tool')
    const args = parseArgs(item.raw) || {}
    if (name.indexOf('mcp__') === 0) {
      const parts = name.split('__')
      const server = parts[1] || 'mcp'
      return { id: 'mcp:' + server, kind: 'mcp', label: server, sub: 'MCP 服务器', tool: parts.slice(2).join('__') }
    }
    if (name === 'skill') {
      const skill = String(args.skill || args.name || '').trim()
      return { id: 'skill:' + (skill || 'unknown'), kind: 'skill', label: skill || '技能', sub: '技能包 SKILL.md' }
    }
    if (name === 'subagent' || name === 'spawn_teammate') {
      return { id: 'agent:spawn', kind: 'agent', label: '派发子 agent', sub: '新建子会话' }
    }
    if (name === 'read' || name === 'write' || name === 'edit' || name === 'glob' || name === 'grep' || name === 'read_image') {
      return fileCategory(args.file_path || args.path || args.target || args.directory)
    }
    if (name === 'pwsh' || name === 'bash') {
      return { id: 'shell', kind: 'shell', label: '本机终端', sub: name === 'pwsh' ? 'PowerShell' : 'Bash' }
    }
    if (name === 'web_search' || name === 'web_fetch') {
      return { id: 'web', kind: 'web', label: '互联网', sub: '搜索 / 抓网页' }
    }
    if (name.indexOf('session_') === 0) {
      return { id: 'memory', kind: 'memory', label: '历史会话库', sub: '以前的会话记录' }
    }
    if (name.indexOf('schedule_') === 0) {
      return { id: 'schedule', kind: 'plan', label: '定时任务', sub: 'schedule' }
    }
    if (name.indexOf('job_') === 0) {
      return { id: 'jobs', kind: 'shell', label: '后台任务', sub: 'job' }
    }
    if (name === 'present') {
      return { id: 'deliver', kind: 'deliver', label: '交付文件', sub: 'present' }
    }
    if (name.indexOf('cordis_') === 0 || name === 'plugin_manager' || name === 'plugin_market') {
      return { id: 'plugin', kind: 'plugin', label: '插件系统', sub: 'Cordis / 插件管理' }
    }
    if (name === 'todo_write' || name === 'create_goal' || name === 'update_goal' || name === 'get_goal') {
      return { id: 'plan', kind: 'plan', label: '计划与目标', sub: 'todo / goal' }
    }
    if (name === 'send_message' || name === 'interrupt_agent' || name === 'list_agents' || name === 'wait_agent') {
      return { id: 'agent:control', kind: 'agent', label: '子 agent 通信', sub: '消息 / 中断' }
    }
    return { id: 'tool:' + name, kind: 'tool', label: name, sub: '内置工具' }
  }

  function targetOf(item) {
    const name = String(item.name || 'tool')
    const args = parseArgs(item.raw) || {}
    const pick = function () {
      for (let index = 0; index < arguments.length; index += 1) {
        const value = args[arguments[index]]
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
      return ''
    }
    if (name === 'read' || name === 'write' || name === 'edit' || name === 'read_image' || name === 'glob' || name === 'grep') {
      const path = pick('file_path', 'path', 'target', 'directory', 'pattern')
      const normalized = path.replace(/\//g, '\\').toLowerCase()
      const parts = normalized.split('\\')
      return { key: 'file:' + normalized, label: parts[parts.length - 1] || normalized, target: clip(path, 120) }
    }
    if (name === 'skill') {
      const skill = pick('skill', 'name')
      return { key: 'skill:' + skill.toLowerCase(), label: skill || '技能', target: skill }
    }
    if (name === 'web_search') {
      const query = pick('query')
      return { key: 'q:' + query.toLowerCase(), label: clip(query, 34), target: query }
    }
    if (name === 'web_fetch') {
      const url = pick('url')
      let label = url
      try {
        label = new URL(url).host
      } catch {
        label = clip(url, 30)
      }
      return { key: 'u:' + url.toLowerCase(), label, target: clip(url, 120) }
    }
    if (name === 'pwsh' || name === 'bash') {
      const command = pick('command')
      return { key: 'cmd:' + clip(command, 200).toLowerCase(), label: clip(command.split('\n')[0], 34), target: clip(command, 120) }
    }
    if (name.indexOf('mcp__') === 0) {
      const parts = name.split('__')
      const tool = parts.slice(2).join('__') || name
      return { key: 'mcp:' + tool, label: tool, target: tool }
    }
    if (name.indexOf('session_') === 0) {
      const query = pick('query')
      return { key: 'q:' + query.toLowerCase(), label: clip(query, 30) || name, target: query }
    }
    if (name === 'subagent' || name === 'spawn_teammate') {
      const label = pick('label') || pick('prompt')
      return { key: 'agent:' + clip(label, 120).toLowerCase(), label: clip(label, 30) || '子 agent', target: clip(label, 120) }
    }
    const first = pick('id', 'name', 'target', 'path', 'file', 'query', 'description')
    return { key: name + ':' + clip(first, 120).toLowerCase(), label: clip(first, 34) || name, target: clip(first, 120) }
  }

  async function mapOf(rootId) {
    const feed = await ensureFeed(rootId)
    const built = await graph(rootId)
    const entries = new Map()
    let toolCalls = 0
    let errors = 0
    let liveId = null
    let liveCall = null

    for (const item of feed.items) {
      if (item.kind !== 'call') continue
      toolCalls += 1
      const capability = capabilityOf(item)
      let entry = entries.get(capability.id)
      if (!entry) {
        entry = {
          id: capability.id,
          kind: capability.kind,
          label: capability.label,
          sub: capability.sub || '',
          count: 0,
          hits: 0,
          ok: 0,
          fail: 0,
          ms: 0,
          last: 0,
          sample: '',
          tools: [],
          dots: [],
          byKey: new Map(),
        }
        entries.set(capability.id, entry)
      }
      entry.hits += 1

      const target = targetOf(item)
      let dot = entry.byKey.get(target.key)
      if (!dot) {
        dot = { key: target.key, label: target.label, target: target.target, hits: 0, ok: 0, fail: 0, ms: 0, last: 0, seq: 0 }
        entry.byKey.set(target.key, dot)
        entry.dots.push(dot)
      }
      dot.hits += 1

      if (item.res) {
        if (item.res.ok) {
          entry.ok += 1
          dot.ok += 1
        } else {
          entry.fail += 1
          dot.fail += 1
          errors += 1
        }
        const spent = item.res.time && item.time ? item.res.time - item.time : 0
        entry.ms += spent
        dot.ms += spent
        entry.last = Math.max(entry.last, item.res.time || 0)
        dot.last = Math.max(dot.last, item.res.time || 0)
        dot.seq = item.seq
      } else {
        entry.last = Math.max(entry.last, item.time || 0)
        dot.last = Math.max(dot.last, item.time || 0)
        dot.seq = item.seq
        liveId = capability.id
        liveCall = {
          capId: capability.id,
          seq: item.seq,
          name: String(item.name || 'tool'),
          args: item.args || '',
          t: item.time || Date.now(),
        }
      }
      if (!entry.sample && item.args) entry.sample = item.args
      if (capability.tool && entry.tools.indexOf(capability.tool) < 0) entry.tools.push(capability.tool)
    }

    for (const entry of entries.values()) {
      entry.count = entry.dots.length
      delete entry.byKey
      entry.dots.sort((one, two) => one.last - two.last)
    }

    for (const agent of (built.nodes || []).filter((node) => node.depth > 0)) {
      const id = 'agent:' + agent.id
      let calls = 0
      let fails = 0
      try {
        const childFeed = await ensureFeed(agent.id)
        for (const item of childFeed.items) {
          if (item.kind !== 'call') continue
          calls += 1
          if (item.res && !item.res.ok) fails += 1
        }
      } catch {
        /* an unreadable child log still shows the node */
      }
      entries.set(id, {
        id,
        kind: 'agent',
        label: agent.label || '子 agent',
        sub: (agent.status === 'running' ? '运行中' : '空闲') + (agent.current && agent.current.text ? ' · 正在 ' + agent.current.text : ''),
        count: Math.max(1, calls),
        hits: calls,
        ok: calls - fails,
        fail: fails,
        ms: 0,
        last: agent.lastTime || 0,
        sample: '',
        tools: [],
        dots: [],
      })
    }

    const nodes = Array.from(entries.values()).sort((a, b) => b.count - a.count)
    return {
      ok: true,
      now: Date.now(),
      root: rootId,
      model: {
        provider: feed.provider || '',
        model: feed.model || '',
        tokensIn: feed.tokensIn,
        tokensOut: feed.tokensOut,
        requests: feed.requests,
        turns: feed.turns,
        toolCalls,
        errors,
        contextWindow: feed.contextWindow || 0,
      },
      live: liveId,
      liveCall,
      nodes,
      edges: nodes.map((node) => ({ from: 'model', to: node.id, count: node.count })),
    }
  }

  async function mapResource(request) {
    try {
      const url = new URL(request.url, 'http://localhost')
      const rootId = url.searchParams.get('root') || ''
      if (!rootId) return json({ ok: false, error: 'missing root' })
      return json(await mapOf(rootId))
    } catch (error) {
      return json({ ok: false, error: String((error && error.stack) || error) })
    }
  }

  function json(body) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  async function snapshotResource(request) {
    try {
      const url = new URL(request.url, 'http://localhost')
      const rootId = url.searchParams.get('root') || ''
      const focusId = url.searchParams.get('focus') || rootId
      if (!rootId) return json({ ok: false, error: 'missing root' })
      const built = await graph(rootId)
      const nodes = built.nodes || []
      let items = []
      let focus = focusId
      const known = nodes.some((node) => node.id === focusId)
      if (!known) {
        focus = nodes.length ? nodes[0].id : rootId
      }
      if (focus) {
        try {
          const store = await ensureFeed(focus)
          items = store.items.slice(-ITEMS_SENT)
        } catch {
          items = []
        }
      }
      return json({
        ok: true,
        now: Date.now(),
        root: rootId,
        focus,
        nodes,
        items,
        error: built.error || '',
      })
    } catch (error) {
      return json({
        ok: false,
        error: String((error && error.stack) || (error && error.message) || error),
      })
    }
  }

  async function sessionsResource() {
    try {
      const corpus = await ctx.sessionQuery.listSessions()
      const sessions = (corpus || []).slice(0, 40).map((record) => ({
        id: record.header && record.header.id,
        parent: (record.header && record.header.parentSession) || null,
        live: record.live === true,
        created: (record.header && record.header.createdAt) || 0,
      }))
      const store = ctx.get('sessions')
      const live = store && typeof store.list === 'function'
        ? store.list().map((session) => ({ id: session.header ? session.header.id : String(session.id), seq: session.seq }))
        : []
      return json({ ok: true, sessions, live })
    } catch (error) {
      return json({ ok: false, error: String((error && error.stack) || error) })
    }
  }

  function pingResource() {
    return json({ ok: true, plugin: 'agent-workflow-viewer', now: Date.now() })
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/agent-workflow/snapshot',
      resource: snapshotResource,
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/agent-workflow/map',
      resource: mapResource,
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/agent-workflow/sessions',
      resource: sessionsResource,
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/agent-workflow/ping',
      resource: pingResource,
    }),
  )
}
