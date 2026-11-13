import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'

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

function setup({ read = async () => ({ events: [] }), host = '127.0.0.1', sessions = new Map(), children = [] } = {}) {
  const routes = new Map()
  const listeners = new Map()
  const emit = (name, payload) => {
    for (const listener of listeners.get(name) ?? []) listener(payload)
  }
  apply({
    get: (name) => name === 'sessions' ? sessions : undefined,
    effect: (register) => register(),
    on: (name, listener) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener])
      return () => listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== listener))
    },
    webServer: { host, register: (route) => routes.set(route.path, route) },
    sessionQuery: {
      readSession: read,
      traceSession: async () => ({ target: record(root), descendants: children }),
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
