import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
import { canvasHtml, fitCamera } from '../canvas.js'

const root = 'root'
const child = 'child'
const event = (seq, type, data = {}) => ({ seq, type, data, time: 1000 + seq })
const call = (seq, name, args, turn = 1) => event(seq, 'tool/call', {
  callId: 'call-' + seq, name, arguments: JSON.stringify(args), turn,
})
const result = (seq, callSeq, failed = false) => event(seq, 'tool/result', {
  message: { toolCallId: 'call-' + callSeq, isError: failed, content: failed ? 'could not read' : 'done' },
})
const record = (id, parentSession) => ({ header: { id, parentSession } })

function setup({ read = async () => ({ events: [] }), host = '127.0.0.1', sessions = new Map(), children = [], connection, listSessions } = {}) {
  const routes = new Map()
  const listeners = new Map()
  const emit = (name, payload) => {
    for (const listener of listeners.get(name) ?? []) listener(payload)
  }
  apply({
    get: (name) => ({ sessions, connection })[name],
    effect: (register) => register(),
    on: (name, listener) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener])
      return () => listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== listener))
    },
    webServer: { host, getOrigin: () => 'http://127.0.0.1:34567', register: (route) => routes.set(route.path, route) },
    sessionQuery: {
      readSession: read,
      traceSession: async () => ({ target: record(root), descendants: children }),
      listSessions: listSessions || (async () => [
        { header: { id: root, createdAt: 1000 }, live: sessions.has(root) },
        { header: { id: child, parentSession: root, createdAt: 1200 }, live: sessions.has(child) },
      ]),
    },
  })
  async function get(path, query = {}, { headers, peer } = {}) {
    const request = new Request('http://localhost/agent-workflow/' + path + '?' + new URLSearchParams({ root, ...query }), { headers })
    const response = await routes.get('/agent-workflow/' + path).resource(request, peer)
    return { status: response.status, body: response.status === 204 ? null : await response.json() }
  }
  return { get, routes, emit }
}

function live(events, inheritedEventCount = 0) {
  return { get seq() { return events.length }, inheritedEventCount, snapshotEvents: (start, end) => events.slice(start, end) }
}

test('parallel cold reads share one result and a transient failure can retry', async () => {
  let attempts = 0
  let resolve
  const ready = new Promise((done) => { resolve = done })
  const { get } = setup({ read: async () => {
    if (++attempts === 1) throw Error('busy')
    return ready
  } })
  assert.equal((await get('map')).status, 503)
  const map = get('map')
  const timeline = get('snapshot')
  resolve({ events: [call(0, 'read', { path: '/project/plan.md' }), result(1, 0)] })
  assert.equal((await map).body.calls, 1)
  assert.equal((await timeline).body.items.length, 1)
  assert.equal(attempts, 2)
})

test('the browser board requires an authenticated handoff and follows the selected live session only', async () => {
  const events = [call(0, 'read', { path: '/private/notes.txt' })]
  const sessions = new Map([[child, live(events)]])
  const { get, routes } = setup({
    sessions, children: [{ session: record(child, root) }],
    connection: { admit: (request) => request.headers.get('cookie') === 'fixture=owner' ? { peer: {} } : { rejection: 401 } },
  })
  const host = { host: '127.0.0.1:34567' }
  const headers = { ...host, 'x-awv-detach': '1' }
  assert.equal((await get('board-link', { focus: child }, { headers })).status, 403)
  const owner = { ...headers, cookie: 'fixture=owner' }
  assert.equal((await get('board-link', { focus: 'unknown' }, { headers: owner })).status, 404)
  const handoff = await get('board-link', { focus: child }, { headers: owner })
  assert.equal(handoff.status, 200)
  const url = new URL(handoff.body.url)
  assert.equal(url.origin, 'http://127.0.0.1:34567')
  assert.equal(url.search, '')
  const page = await routes.get('/agent-workflow/board').resource(new Request(url, { headers: host }))
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
  assert(!(await page.text()).includes('private/notes.txt'))
  assert.equal((await get('board-data', {}, { headers: host })).status, 401)
  const authorization = 'Bearer ' + new URLSearchParams(url.hash.slice(1)).get('key')
  const browser = { ...host, authorization, 'sec-fetch-site': 'same-origin' }
  assert.equal((await get('board-data', {}, { headers: { ...browser, origin: 'https://other.example' } })).status, 403)
  assert.equal((await get('board-data', {}, { headers: { ...browser, host: 'other.example' } })).status, 403)
  const initial = await get('board-data', { root: 'other', focus: 'other' }, { headers: browser })
  assert.equal(initial.body.calls, 1)
  assert.equal(initial.body.active[0].name, 'read')
  assert(!JSON.stringify(initial.body).includes('/private/notes.txt'))
  assert.equal((await get('board-data', { version: initial.body.version }, { headers: browser })).status, 204)
  events.push(result(1, 0), call(2, 'write', { path: '/private/new.txt' }))
  const updated = await get('board-data', { version: initial.body.version }, { headers: browser })
  assert.equal(updated.body.calls, 2)
  assert.equal(updated.body.active[0].name, 'write')
  const separateHost = setup()
  assert.equal((await separateHost.get('board-data', {}, { headers: browser })).status, 401)
})

test('browser canvas handoff lists session titles and can select another session', async () => {
  const records = [record(root), record(child, root), record('another'), record('other-child', 'another')]
  const events = [
    event(0, 'session/title', { title: '设计复核' }),
    call(1, 'read', { path: '/private/project-plan.txt' }),
    result(2, 1, true),
  ]
  const sessions = new Map([[root, live(events)], [child, live([])],
    ['another', live([event(0, 'user/message', { content: 'private prompt fallback' })])]])
  const { get, routes } = setup({ sessions, listSessions: async () => records })
  const host = { host: '127.0.0.1:34567' }
  const headers = { ...host, 'x-awv-detach': '1' }
  const query = { view: 'canvas', roots: root }
  assert.equal((await get('board-link', query, { headers })).status, 403)
  const handoff = await get('board-link', query, { headers, peer: {} })
  const url = new URL(handoff.body.url)
  assert.equal(url.pathname, '/agent-workflow/canvas-board')
  const page = await routes.get(url.pathname).resource(new Request(url, { headers: host }))
  assert.equal(page.status, 200)
  const key = new URLSearchParams(url.hash.slice(1)).get('key')
  assert.equal((await get('canvas-board-data', {}, { headers: host })).status, 401)
  const browser = { ...host, authorization: 'Bearer ' + key, 'sec-fetch-site': 'same-origin' }
  assert.equal((await get('board-data', {}, { headers: browser })).status, 401)
  const details = { roots: root, inspect: root }
  const response = await get('canvas-board-data', details, { headers: browser })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.roots.map((entry) => entry.id), [root, child])
  assert.deepEqual(response.body.sessions.map((entry) => entry.id), [root, child, 'another'])
  assert.equal(response.body.sessions[0].label, '设计复核')
  assert.equal(response.body.roots[0].failures, 1)
  assert.doesNotMatch(JSON.stringify(response.body), /private|could not read/)
  const changed = await get('canvas-board-data', { roots: root + ',another' }, { headers: browser })
  assert.deepEqual(changed.body.roots.map((entry) => entry.id), [root, 'another', child, 'other-child'])
  assert.equal((await get('canvas-board-data', { ...details, version: response.body.version }, { headers: browser })).status, 204)
  records.unshift(record('new-session'), record('new-child', 'new-session'))
  const refreshed = await get('canvas-board-data', { ...details, version: response.body.version }, { headers: browser })
  assert.equal(refreshed.status, 200)
  assert.deepEqual(refreshed.body.roots.map((entry) => entry.id), [root, child])
  assert(refreshed.body.sessions.some((entry) => entry.id === 'new-session'))
  assert(!refreshed.body.sessions.some((entry) => entry.id === 'new-child'))
  const childOnly = await get('canvas-board-data', { roots: 'new-child' }, { headers: browser })
  assert.deepEqual(childOnly.body.roots, [])
  const added = await get('canvas-board-data', { roots: root + ',new-session,new-child' }, { headers: browser })
  assert.deepEqual(added.body.roots.map((entry) => entry.id), [root, 'new-session', child, 'new-child'])
  assert.equal((await get('board-link', { view: 'canvas' }, { headers, peer: {} })).status, 200)
})

test('live-to-disk transition preserves counts and settles incomplete calls', async () => {
  const events = [call(0, 'read', { path: '/project/plan.md' })]
  const sessions = new Map([[root, live(events)]])
  const { get } = setup({ sessions, read: async () => ({ events }) })
  const first = (await get('map')).body
  assert.equal(first.running, 1)
  assert.equal((await get('map', { version: first.version })).status, 204)
  sessions.clear()
  const second = (await get('map', { version: first.version })).body
  assert.equal(second.calls, 1)
  assert.equal(second.running, 0)
  assert.equal(second.interrupted, 1)
  assert.equal((await get('snapshot')).body.items[0].result.status, 'interrupted')
})

test('canvas keeps the last complete graph and title during a delayed disk handover', async () => {
  const events = [
    event(0, 'session/title', { title: '稳定标题' }),
    call(1, 'read', { path: '/project/plan.md' }),
  ]
  const sessions = new Map([[root, live(events)]])
  let finishRead
  const pending = new Promise((resolve) => { finishRead = resolve })
  const { get } = setup({ sessions, read: (id) => id === root ? pending : Promise.resolve({ events: [] }) })
  const query = { roots: root, compact: '1', graphs: '1' }
  const liveCanvas = (await get('canvas-data', query)).body
  sessions.delete(root)
  const loading = (await get('canvas-data', query)).body
  assert.equal(loading.roots[0].ready, true)
  assert.equal(loading.sessions[0].label, '稳定标题')
  assert.deepEqual(loading.roots[0].nodes, liveCanvas.roots[0].nodes)
  finishRead({ events: events.concat(result(2, 1)), inheritedEventCount: 1 })
  await get('map')
  const disk = (await get('canvas-data', query)).body
  assert.equal(disk.roots[0].running, 0)
  assert.equal(disk.sessions[0].label, '稳定标题')
})

test('target identity survives long arguments and respects Windows and POSIX path semantics', async () => {
  const events = [
    call(0, 'write', { content: 'x'.repeat(2500), file_path: '/Project/Case.md' }),
    result(1, 0),
    call(2, 'read', { path: '/Project/case.md' }),
    result(3, 2),
    call(4, 'read', { path: 'C:/Project/File.md' }),
    result(5, 4),
    call(6, 'read', { path: 'c:\\project\\file.md' }),
    result(7, 6, true),
  ]
  const { get } = setup({ read: async () => ({ events }) })
  const map = (await get('map')).body
  assert.equal(map.nodes[0].count, 3)
  assert.deepEqual(map.nodes[0].dots.map((dot) => dot.label), ['File.md', 'case.md', 'Case.md'])
  assert.equal(map.nodes[0].dots[0].hits, 2)
  assert.equal(map.nodes[0].dots[0].totalMs, 2)
  assert.equal(map.nodes[0].dots[0].failureSeq, 6)
  assert.equal(map.failures, 1)
  const timeline = (await get('snapshot')).body
  assert.equal(timeline.items[0].summary, '/Project/Case.md')
  assert.equal('object' in timeline.items[0], false)
})

test('parallel active calls settle by turn and child views omit inherited events', async () => {
  const events = [call(0, 'read', { path: 'one' }), call(1, 'read', { path: 'two' }), call(2, 'read', { path: 'three' }, 2)]
  const sessions = new Map([[root, live(events)], [child, live(events, 2)]])
  const { get } = setup({ sessions, children: [{ session: record(child, root) }] })
  assert.equal((await get('map')).body.active.length, 3)
  events.push(event(3, 'turn/end', { turn: 1, reason: { kind: 'interrupted' } }))
  const map = (await get('map')).body
  assert.deepEqual(map.active.map((entry) => entry.seq), [2])
  assert.equal(map.interrupted, 2)
  const focused = (await get('map', { focus: child })).body
  assert.equal(focused.calls, 1)
  assert.equal(focused.partial, false)
  assert.equal((await get('map', { focus: 'unrelated' })).status, 404)
})

test('timeline locates seq zero, paginates without overlap, and filters orphan failures', async () => {
  const events = [call(0, 'read', { path: 'old' }), result(1, 0)]
  for (let seq = 2; seq < 502; seq++) events.push(event(seq, 'user/message', { content: 'message' }))
  events.push(result(502, 600, true))
  const { get } = setup({ read: async () => ({ events }) })
  const tail = (await get('snapshot')).body
  assert.equal(tail.items.length, 400)
  const anchor = (await get('snapshot', { at: 0 })).body
  assert.equal(anchor.items[0].seq, 0)
  const older = (await get('snapshot', { before: tail.older })).body
  assert.equal(older.items.at(-1).seq + 1, tail.items[0].seq)
  assert.equal((await get('snapshot', { after: older.newer })).body.items[0].seq, tail.items[0].seq)
  assert.equal((await get('snapshot', { filter: 'failed' })).body.items[0].kind, 'result')
})

test('large sessions keep accurate window counts with a bounded graph payload', async () => {
  const events = Array.from({ length: 3400 }, (_, seq) => call(seq, 'read', { path: '/project/file-' + seq }))
  const sessions = new Map([[root, live(events)]])
  const { get } = setup({ sessions })
  const map = (await get('map')).body
  assert.equal(map.calls, 3000)
  assert.equal(map.nodes[0].count, 3000)
  assert.equal(map.partial, true)
  assert.equal(map.active.length, 12)
  assert.equal(map.nodes[0].dots.length, 96)
  assert(Buffer.byteLength(JSON.stringify(map)) < 26000)
  assert.equal((await get('map', { version: map.version })).status, 204)
})

test('activity routes request Harness admission and legacy peerless access is limited', async () => {
  const { get, routes } = setup()
  assert.equal(routes.get('/agent-workflow/map').auth, 'required')
  assert.equal(routes.has('/agent-workflow/sessions'), false)
  assert.equal((await get('map', {}, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await get('map', {}, { headers: { host: 'nonlocal.example' } })).status, 403)
  const remote = setup({ host: '0.0.0.0' })
  assert.equal((await remote.get('snapshot')).status, 403)
  assert.equal((await remote.get('snapshot', {}, { peer: {} })).status, 200)
})

test('a working subagent stays visible from the root view', async () => {
  const child = 'child-running'
  const { get, emit } = setup({ children: [{ session: record(child, root), descendants: [] }] })
  emit('agent/status', { agent: { id: child }, status: 'running' })
  const busy = await get('map')
  assert.equal(busy.body.working, 1)
  assert.equal(busy.body.sessions.find((session) => session.id === child).running, true)
  emit('agent/status', { agent: { id: child }, status: 'idle' })
  const idle = await get('map')
  assert.equal(idle.body.working, 0)
})

test('the standalone board carries the panel views, colour schemes, and interaction hooks', async () => {
  const { routes } = setup()
  const host = { host: '127.0.0.1:34567' }
  const page = await routes.get('/agent-workflow/view')
    .resource(new Request('http://127.0.0.1:34567/agent-workflow/view?root=root', { headers: host }))
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8')
  const html = await page.text()
  // Same two views as the conversation panel, plus the session selector.
  assert(html.includes('时间线'))
  assert(html.includes('正在执行'))
  assert(html.includes('#sessions'))
  // Manual colour schemes on top of the system preference.
  assert(html.includes('跟随系统'))
  assert(html.includes('prefers-color-scheme:dark'))
  assert(html.includes('awv-board-theme'))
  // Interaction hooks: zoom, pan, object detail.
  assert(html.includes('wheel'))
  assert(html.includes('pointermove'))
  assert(html.includes('data-cap'))
  // Both payloads are reachable from the same page.
  assert(html.includes('snapshot'))
  assert(html.includes('board-data'))
  assert(!html.includes('unsafe-eval'))
  const board = await routes.get('/agent-workflow/board')
    .resource(new Request('http://127.0.0.1:34567/agent-workflow/board', { headers: host }))
  assert.equal(board.status, 200)
  assert.equal(board.headers.get('referrer-policy'), 'no-referrer')
  assert((await board.text()).includes('view-only'))
})

test('reasoning blocks become thinking entries, are filterable, and are priced from token buckets', async () => {
  const events = [
    event(0, 'request/header', { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } }),
    call(1, 'read', { file_path: '/project/plan.md' }),
    result(2, 1),
    event(3, 'assistant/message', {
      step: 2,
      message: {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'check the plan before editing' },
          { type: 'text', text: 'edited the plan' },
        ],
      },
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 4000, cacheWriteTokens: 0, totalTokens: 5200 },
    }),
  ]
  const { get } = setup({ read: async () => ({ events }) })
  const timeline = (await get('snapshot')).body
  const thinking = timeline.items.filter((item) => item.kind === 'thinking')
  assert.equal(thinking.length, 1)
  assert.equal(thinking[0].text, 'check the plan before editing')
  assert.equal(thinking[0].step, 2)
  assert.deepEqual((await get('snapshot', { filter: 'thinking' })).body.items.map((item) => item.kind), ['thinking'])
  const map = (await get('map')).body
  assert.equal(map.spend.requests, 1)
  assert.equal(map.spend.priced, 1)
  // 1970-01-01 is a Thursday at 00:00 UTC: off-peak rates.
  const expected = (4000 * 0.003 + 1000 * 0.15 + 200 * 0.6) / 1e6
  assert(Math.abs(map.spend.usd - expected) < 1e-12)
  assert.equal(map.spend.asOf.length > 0, true)
  assert.equal(map.topSteps.length, 1)
  assert(Math.abs(map.topSteps[0].usd - expected) < 1e-12)
  // Prompt growth since the previous request is attributed to the capability it came from.
  assert(Math.abs(map.nodes[0].usd - (5000 * 0.15) / 1e6) < 1e-12)
})

test('the overview lists every recent session with its own numbers', async () => {
  const events = [
    event(0, 'request/header', { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } }),
    call(1, 'read', { path: '/project/plan.md' }),
    result(2, 1),
    event(3, 'assistant/message', {
      message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      usage: { inputTokens: 900, outputTokens: 100, cacheReadTokens: 100, cacheWriteTokens: 0, totalTokens: 1100 },
    }),
  ]
  const sessions = new Map([[root, live(events)]])
  const { get, routes } = setup({ sessions, read: async () => ({ events }) })
  const overview = async (query = {}) => {
    const request = new Request('http://localhost/agent-workflow/overview?' + new URLSearchParams(query))
    const response = await routes.get('/agent-workflow/overview').resource(request)
    return { status: response.status, body: response.status === 204 ? null : await response.json() }
  }
  // Nothing cached yet: the page answers immediately and warms feeds in the background.
  const cold = await overview()
  assert.equal(cold.status, 200)
  assert.equal(cold.body.sessions.length, 2)
  assert.equal(cold.body.sessions.find((row) => row.id === root).ready, false)
  assert.equal(routes.get('/agent-workflow/overview').auth, 'required')
  // After the session feed is loaded, its numbers appear.
  await get('map')
  const warm = await overview()
  const row = warm.body.sessions.find((entry) => entry.id === root)
  assert.equal(row.ready, true)
  assert.equal(row.calls, 1)
  assert(row.usd > 0)
  assert.equal(warm.body.totals.sessions, 2)
  assert.equal((await overview({ version: warm.body.version })).status, 204)
})

test('the application-level canvas serves a page and combines several sessions', async () => {
  const events = [
    event(0, 'subagent/catalog', { childId: child, label: 'facade builder' }),
    call(1, 'read', { path: '/project/a.md' }),
    result(2, 1),
  ]
  const childEvents = [call(0, 'read', { path: '/project/b.md' }), result(1, 0)]
  const sessions = new Map([[root, live(events)], [child, live(childEvents)]])
  const { get, routes } = setup({
    sessions,
    read: async (id) => ({ events: id === child ? childEvents : events }),
    children: [{ session: record(child, root) }],
    listSessions: async () => [
      { header: { id: root, createdAt: 1000 }, live: true },
      { header: { id: child, parentSession: root, createdAt: 1200 }, live: true },
    ],
  })
  const page = await routes.get('/agent-workflow/canvas')
    .resource(new Request('http://localhost/agent-workflow/canvas'))
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8')
  const html = await page.text()
  assert(html.includes('工作流画布'))
  assert(html.includes('canvas-data'))
  assert.equal(routes.get('/agent-workflow/canvas-data').auth, 'required')
  const canvas = async (query) => {
    const request = new Request('http://localhost/agent-workflow/canvas-data?' + new URLSearchParams(query))
    const response = await routes.get('/agent-workflow/canvas-data').resource(request)
    return { status: response.status, body: response.status === 204 ? null : await response.json() }
  }
  // Unknown ids are dropped, and the picker still lists every session.
  const cold = await canvas({ roots: [root, 'unknown'].join(',') })
  assert.equal(cold.status, 200)
  assert.equal(cold.body.roots.length, 1)
  assert.equal(cold.body.roots[0].id, root)
  assert.equal(cold.body.sessions.length, 2)
  assert.equal(cold.body.sessions.find((row) => row.id === child).parent, root)
  await get('map')
  const warm = await canvas({ roots: [root].join(',') })
  const drawn = warm.body.roots[0]
  assert.equal(drawn.ready, true)
  assert.equal(drawn.calls, 1)
  assert.equal(drawn.agents.length, 1)
  assert.equal(drawn.agents[0].label, 'facade builder')
  assert.equal(drawn.nodes.length > 0, true)
  assert.equal((await canvas({ roots: root, version: warm.body.version })).status, 204)
})

test('a subagent keeps the label its parent dispatched it with', async () => {
  const sessions = new Map([[root, live([event(0, 'subagent/catalog', { childId: child, label: 'facade builder' })])]])
  const { get } = setup({ sessions, children: [{ session: record(child, root) }] })
  const map = (await get('map')).body
  assert.equal(map.catalog.find((entry) => entry.id === child).label, 'facade builder')
  assert.equal(map.sessions.find((session) => session.id === child).label, 'facade builder')
  assert.equal(map.sessions.find((session) => session.id === root).depth, 0)
})

test('canvas summaries refresh on settlement and only expand the inspected session', async () => {
  const events = [
    event(0, 'session/title', { title: '模型整理' }),
    call(1, 'read', { path: '/project/plan.md' }),
  ]
  const sessions = new Map([[root, live(events)]])
  const { get, routes } = setup({ sessions, children: [{ session: record(child, root) }] })
  const query = { roots: root, compact: '1' }
  const started = (await get('canvas-data', query)).body
  assert.equal(started.sessions.find((row) => row.id === root).label, '模型整理')
  assert.equal(started.roots[0].running, 1)
  assert.equal(started.roots[0].nodes, undefined)
  assert.equal(started.roots[0].agents, undefined)

  events.push(result(2, 1, true), event(3, 'turn/end', { turn: 1 }))
  const finished = await get('canvas-data', { ...query, version: started.version })
  assert.equal(finished.status, 200)
  assert.equal(finished.body.roots[0].calls, started.roots[0].calls)
  assert.equal(finished.body.roots[0].running, 0)
  assert.equal(finished.body.roots[0].failures, 1)
  assert.equal((await get('canvas-data', { ...query, version: finished.body.version })).status, 204)

  const inspected = (await get('canvas-data', { ...query, inspect: root })).body.roots[0]
  assert.equal(inspected.nodes[0].dots[0].failureSeq, 1)
  assert.equal(inspected.agents[0].id, child)

  const board = routes.get('/agent-workflow/view')
  const page = await board.resource(new Request('http://localhost/agent-workflow/view?root=root&filter=failed&at=0'))
  assert.match(await page.text(), /"filter":"failed","at":0/)
})

test('canvas keeps older selections addressable beyond the initial picker window', async () => {
  const records = Array.from({ length: 42 }, (_, index) => ({
    header: { id: 'session-' + index, createdAt: 1000 - index },
  }))
  const { get } = setup({ listSessions: async () => records })
  const ids = records.slice(-8).map(({ header }) => header.id)
  const response = (await get('canvas-data', { compact: '1', roots: ids.join(',') })).body
  assert.deepEqual(response.roots.map((row) => row.id), ids)
  assert.equal(response.sessions.length, 40)
  assert(response.sessions.some((row) => row.id === 'session-41'))
})

test('shared canvas carries working paths, failure evidence and cost anchors', async () => {
  const events = [
    event(0, 'request/header', { header: { config: { model: 'deepseek-flash' } } }),
    event(1, 'assistant/message', {
      message: { role: 'assistant', content: [] },
      usage: { inputTokens: 3000, cacheReadTokens: 1000, outputTokens: 20 },
    }),
    call(2, 'read', { path: '/project/fail.md' }),
    result(3, 2, true),
    call(4, 'read', { path: '/project/live.md' }),
    call(5, 'web_search', { query: 'plans' }),
  ]
  const sessions = new Map([[root, live(events)], [child, live([call(0, 'read', { path: '/project/child.md' })])]])
  const { get } = setup({ sessions })
  const query = { compact: '1', graphs: '1', roots: [root, child].join(',') }
  const overview = (await get('canvas-data', query)).body.roots
  assert.equal(overview.length, 2)
  assert(overview.every((entry) => entry.nodes.length > 0))
  assert.equal(overview[0].active[0].seq, 5)
  assert.equal(overview[0].topSteps[0].seq, 1)
  assert.equal(overview[0].topSteps[0].priced, true)
  assert.equal(overview[0].evidence, undefined)
  const fault = (await get('canvas-data', { ...query, mode: 'failed', inspect: root })).body.roots[0]
  assert.equal(fault.nodes.length, 1)
  assert.equal(fault.nodes[0].dots[0].failureSeq, 2)
  assert.equal(fault.evidence[2], 'could not read')
  assert.equal(fault.nodes[0].dots[1].activeSeq, 4)
  const costRecord = (await get('snapshot', { at: 1 })).body
  assert(costRecord.items.some((item) => item.seq === 1 && item.kind === 'reply'))
})

test('selecting a session includes its live descendants and excludes ordinary forks', async () => {
  const row = (id, parentSession, origin) => ({ header: { id, parentSession, origin } })
  const records = [row(root), row(child, root, 'subagent'), row('nested', child, 'subagent'),
    row('other'), row('old-fork', root, 'fork')]
  const { get } = setup({ listSessions: async () => records })
  const query = { compact: '1', graphs: '1', family: '1', roots: root }
  const first = (await get('canvas-data', query)).body
  assert.deepEqual(first.roots.map((entry) => entry.id), [root, child, 'nested'])
  assert.equal(first.sessions.find((entry) => entry.id === 'old-fork').parent, null)
  records.unshift(row('new-task', root, 'subagent'))
  const update = await get('canvas-data', { ...query, version: first.version })
  assert.equal(update.status, 200)
  assert(update.body.roots.some((entry) => entry.id === 'new-task'))
  assert.deepEqual((await get('canvas-data', { ...query, roots: 'other' })).body.roots.map((entry) => entry.id), ['other'])
})

test('an unpriced model reports spend as unknown instead of a number', async () => {
  const events = [
    call(0, 'read', { file_path: '/project/plan.md' }),
    result(1, 0),
    event(2, 'assistant/message', {
      message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1100 },
    }),
  ]
  const { get } = setup({ read: async () => ({ events }) })
  const map = (await get('map')).body
  assert.equal(map.spend.priced, 0)
  assert.equal(map.spend.unpriced, 1)
  assert.equal(map.spend.usd, 0)
  assert.equal(map.topSteps.length, 0)
})

const inlineScripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])

test('canvas fit waits for a measurable viewport instead of pinning the zoom at 1%', () => {
  const box = { left: 0, top: 0, width: 710, height: 400 }
  // A hidden or still-collapsed pane: no camera, so the caller keeps waiting.
  assert.equal(fitCamera(box, { width: 0, height: 0 }), null)
  assert.equal(fitCamera(box, { width: 492, height: 96 }), null)
  assert.equal(fitCamera(box, { width: 100, height: 800 }), null)
  const camera = fitCamera(box, { width: 1020, height: 796 })
  assert.equal(camera.scale, 1)
  assert.equal(camera.x, 155)
  const tight = fitCamera(box, { width: 403, height: 796 })
  assert.equal(tight.scale, .5)
  assert(fitCamera({ ...box, width: 7100 }, { width: 1020, height: 796 }).scale > .1)
  // The page carries the helper, retries the first fit, and follows viewport resizes.
  const html = canvasHtml()
  assert(html.includes('function fitCamera('))
  assert(html.includes('ResizeObserver'))
  assert(html.includes('state.positioned = fit()'))
  assert(!html.includes('state.positioned = true'))
})

test('inline page scripts parse', async () => {
  const { routes } = setup()
  const host = { host: '127.0.0.1:34567' }
  const board = await routes.get('/agent-workflow/view')
    .resource(new Request('http://127.0.0.1:34567/agent-workflow/view?root=root', { headers: host }))
  for (const html of [canvasHtml(), await board.text()]) {
    const scripts = inlineScripts(html)
    assert(scripts.length > 0)
    for (const script of scripts) assert.doesNotThrow(() => new Function(script))
  }
})

test('canvas text is bilingual: Chinese only as the first argument of t() or beside an English twin', () => {
  const cjk = /[㐀-鿿]/
  const html = canvasHtml()
  const start = html.indexOf('<script>')
  // Static template: every Chinese text node or attribute carries its English replacement.
  for (const [, , attrs, text] of html.slice(0, start).matchAll(/<([a-z0-9]+)([^>]*)>([^<]*)/g)) {
    if (cjk.test(text)) assert(attrs.includes(' data-en="'), 'no English for text: ' + text.trim())
    for (const [, name, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (cjk.test(value)) assert(attrs.includes(' data-en-' + name + '="'), 'no English for ' + name + ': ' + value)
    }
  }
  assert(html.includes('navigator.language'))
  // Script: blank the first argument of every t(...) call; nothing Chinese may remain.
  const script = html.slice(start)
  let rest = ''
  let at = 0
  for (const match of script.matchAll(/(?<![\w.$])t\(/g)) {
    if (match.index < at) continue
    let depth = 0
    let quote = ''
    let end = match.index + 2
    for (; end < script.length; end++) {
      const char = script[end]
      if (quote) { if (char === '\\') end++; else if (char === quote) quote = ''; continue }
      if (char === "'" || char === '"') quote = char
      else if (char === '(') depth++
      else if (char === ')') { if (!depth) break; depth-- }
      else if (char === ',' && !depth) break
    }
    rest += script.slice(at, match.index + 2)
    at = end
  }
  rest += script.slice(at)
  const left = rest.split('\n').filter((line) => cjk.test(line.replace(/\/\/.*$/, '')))
  assert.deepEqual(left, [])
})
