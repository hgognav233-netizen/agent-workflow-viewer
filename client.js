window.__ModuleLoader__.load({
  id: 'agent-workflow-viewer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState } = React
    const zh = (document.documentElement.lang || navigator.language).toLowerCase().startsWith('zh')
    const t = (cn, en) => zh ? cn : en
    const number = new Intl.NumberFormat(zh ? 'zh' : 'en', { notation: 'compact', maximumFractionDigits: 1 })
    const zones = [
      { id: 'web', label: t('网络', 'Web'), color: '#5d9cf7', x: 0, y: 0 },
      { id: 'external', label: t('外部服务', 'External'), color: '#ad92fb', x: 260, y: 0 },
      { id: 'process', label: t('本机进程', 'Processes'), color: '#68c9ad', x: 260, y: 215 },
      { id: 'disk', label: t('本机磁盘', 'Files & skills'), color: '#e4ab66', x: 0, y: 215 },
    ]
    const kindLabels = {
      web: t('网页检索', 'Web tools'), file: t('项目文件', 'Files'), skill: t('技能', 'Skills'),
      shell: t('终端', 'Terminal'), agent: t('子 Agent', 'Subagents'), memory: t('历史会话', 'Session history'),
      plan: t('计划', 'Planning'), plugin: t('插件', 'Plugins'), tool: t('工具', 'Tools'),
    }
    const state = { open: false, session: null }
    const listeners = new Set()
    const update = (patch) => {
      Object.assign(state, patch)
      listeners.forEach((listener) => listener())
    }
    const useViewer = () => {
      const [, render] = useState(0)
      useEffect(() => {
        const listener = () => render((value) => value + 1)
        listeners.add(listener)
        return () => listeners.delete(listener)
      }, [])
      return state
    }

    const CSS = [
      '.awv{--aw-text:var(--dsw-alias-label-primary,#172437);--aw-muted:var(--dsw-alias-label-secondary,#516179);--aw-bg:var(--dsw-alias-bg-layer-1,#fff);--aw-soft:var(--dsw-alias-bg-layer-2,#f5f7fa);--aw-line:var(--dsw-alias-border-l1,#dfe5ee);--aw-brand:var(--dsw-alias-brand-primary,#3264db);--aw-red:var(--dsw-alias-state-error-primary,#b3384c);font:13px/1.5 "Inter",system-ui,sans-serif;color:var(--aw-text)}',
      '.awv,.awv *{box-sizing:border-box}.awv button,.awv select{font:inherit;color:inherit}.awv button{cursor:pointer}.awv button:disabled{cursor:default;opacity:.5}.awv button:focus-visible,.awv select:focus-visible{outline:2px solid var(--aw-brand);outline-offset:2px}',
      '.awv{position:fixed;z-index:90;inset:48px 16px 64px auto;width:min(950px,calc(100vw - 32px));display:flex;flex-direction:column;border:1px solid var(--aw-line);border-radius:18px;background:var(--aw-bg);box-shadow:0 20px 70px #141f3c40;overflow:hidden}',
      '.awv-header{padding:16px 20px 13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.awv-header h2{font-size:19px;letter-spacing:-.035em;margin:0;line-height:1.2}.awv-model{color:var(--aw-muted);font-size:12px;overflow-wrap:anywhere}.awv-title{flex:1;min-width:115px}.awv-mark{width:35px;height:35px;display:grid;place-items:center;background:#172a46;color:#8ab7ff;border-radius:10px;font-size:20px}.awv-close,.awv-button,.awv-select{background:var(--aw-bg);border:1px solid var(--aw-line);border-radius:8px;padding:5px 10px}.awv-close{font-size:18px!important;line-height:1}.awv-button:hover,.awv-close:hover{border-color:var(--aw-brand)}.awv-select{max-width:230px}.awv-inspect-head{margin-bottom:8px}',
      '.awv-nav{display:flex;gap:18px;padding:0 20px;border-bottom:1px solid var(--aw-line);flex:none}.awv-nav button{background:none;border:0;border-bottom:2px solid transparent;padding:8px 1px;color:var(--aw-muted)}.awv-nav [aria-pressed=true]{border-color:var(--aw-brand);color:var(--aw-text);font-weight:650}',
      '.awv-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,30%);flex:1;min-height:0}.awv-map{min-width:0;min-height:0;display:flex;flex-direction:column;background:#101b2e;color:#eaf0fc;position:relative;overflow:hidden}.awv-maphead{padding:14px 16px 0;display:flex;align-items:center;justify-content:space-between;gap:6px}.awv-maphead strong{font-size:13px}.awv-maphead .awv-button{background:#19283e;border-color:#344660;color:#eaf0fc;padding:2px 8px}.awv-maphead span{font-size:11px;color:#a7b9d6;margin-right:6px}.awv-map svg{flex:1;min-height:0;width:100%;display:block;touch-action:none;cursor:grab;user-select:none}.awv-map svg.is-drag{cursor:grabbing}.awv-map svg [role=button]{cursor:pointer;outline:none}.awv-map svg [role=button]:focus-visible .awv-ring{stroke:white;stroke-width:2;opacity:1}.awv-mapfoot{padding:4px 16px 12px;color:#a7b9d6;font-size:11px}.awv-key{display:inline-block;width:7px;height:7px;border-radius:50%;background:#fb8397;margin:0 4px 0 12px}',
      '.awv-inspector{overflow:auto;padding:15px;min-width:0;background:var(--aw-bg)}.awv-inspector h3{font-size:13px;margin:0 0 8px}.awv-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:18px}.awv-metric{border:1px solid var(--aw-line);background:var(--aw-soft);padding:7px 9px;border-radius:9px;min-width:0;text-align:left}.awv-metric b{display:block;font-size:18px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.3}.awv-metric span,.awv-secondary{color:var(--aw-muted);font-size:11px}.awv-bad{color:var(--aw-red)}.awv-inspect-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.awv-list{display:grid;gap:5px;margin:0 0 15px}.awv-list button{background:var(--aw-bg);border:1px solid var(--aw-line);border-radius:8px;text-align:left;padding:7px 9px;display:flex;align-items:center;gap:7px;min-width:0}.awv-list button:hover,.awv-list button[aria-pressed=true]{border-color:var(--aw-brand);background:var(--aw-soft)}.awv-list i{width:7px;height:7px;flex:none;border-radius:50%;background:var(--dot)}.awv-list b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.awv-list span{white-space:nowrap;color:var(--aw-muted);font-size:11px}.awv-detail{overflow-wrap:anywhere;margin:0 0 12px}.awv-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}',
      '.awv-timeline{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--aw-soft)}.awv-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 16px;border-bottom:1px solid var(--aw-line);background:var(--aw-bg)}.awv-controls [aria-pressed=true]{color:var(--aw-brand);border-color:var(--aw-brand)}.awv-page{margin-left:auto;display:flex;gap:5px}.awv-feed{overflow:auto;min-height:0;padding:12px 16px}.awv-row{padding:9px 12px;margin:0 0 6px;border:1px solid var(--aw-line);border-left:3px solid var(--aw-line);border-radius:9px;background:var(--aw-bg);overflow-wrap:anywhere}.awv-row.awv-failed{border-left-color:var(--aw-red)}.awv-row.awv-running{border-left-color:var(--aw-brand)}.awv-row.awv-focus{outline:2px solid var(--aw-brand);outline-offset:-1px}.awv-rowhead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.awv-rowhead time{margin-left:auto;font-size:11px;color:var(--aw-muted);font-variant-numeric:tabular-nums}.awv-row p{margin:4px 0;white-space:pre-wrap}.awv-row summary{cursor:pointer;color:var(--aw-muted)}.awv-turn{padding:5px 3px;color:var(--aw-muted);font-size:11px}.awv-note{padding:12px 16px;color:var(--aw-muted);margin:0}.awv-error{padding:7px 16px;border-bottom:1px solid var(--aw-line);color:var(--aw-red);margin:0}.awv-launch{border:1px solid currentColor;border-radius:8px;padding:3px 8px;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:inherit;white-space:nowrap}.awv-launch[aria-pressed=true]{color:var(--dsw-alias-brand-primary,#3264db)}',
      '@media(max-width:680px){.awv{inset:8px 8px 46px;width:auto}.awv-header{padding:10px 12px}.awv-nav{padding:0 12px}.awv-main{display:flex;flex-direction:column;overflow:auto}.awv-map{flex:none;height:clamp(250px,48dvh,420px)}.awv-inspector{overflow:visible}.awv-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.awv-metric b{font-size:15px}.awv-select{max-width:145px}}',
      '@media(prefers-reduced-motion:no-preference){.awv-live-dot{animation:awv-pulse 1.6s ease-in-out infinite}@keyframes awv-pulse{50%{opacity:.35}}}',
    ].join('\n')

    function useData(path, query, live) {
      const url = '/agent-workflow/' + path + '?' + new URLSearchParams(query)
      const [record, setRecord] = useState(null)
      useEffect(() => {
        const controller = new AbortController()
        let timer
        let pending = false
        let version = ''
        let delay = 1200
        async function load() {
          if (pending || controller.signal.aborted || document.hidden) return
          pending = true
          try {
            const response = await fetch(url + (version ? '&version=' + encodeURIComponent(version) : ''), {
              signal: controller.signal, headers: { accept: 'application/json' },
            })
            if (controller.signal.aborted) return
            if (response.status === 204) {
              setRecord((previous) => previous?.url === url && previous.error ? { ...previous, error: '' } : previous)
            } else {
              if (!response.ok) throw new Error(String(response.status))
              const data = await response.json()
              if (controller.signal.aborted) return
              version = data.version || ''
              setRecord({ url, data, error: '' })
            }
            delay = 1200
          } catch (error) {
            if (controller.signal.aborted) return
            setRecord((previous) => ({ url, data: previous?.url === url ? previous.data : null, error: error.message }))
            delay = Math.min(delay * 2, 10000)
          } finally {
            pending = false
            if (live && !document.hidden && !controller.signal.aborted) timer = setTimeout(load, delay)
          }
        }
        const visibility = () => {
          clearTimeout(timer)
          if (!document.hidden) load()
        }
        document.addEventListener('visibilitychange', visibility)
        load()
        return () => {
          controller.abort()
          clearTimeout(timer)
          document.removeEventListener('visibilitychange', visibility)
        }
      }, [url, live])
      return record?.url === url ? record : { data: null, error: '' }
    }

    function short(text, limit) {
      const chars = Array.from(text || '')
      return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : text
    }
    const labelOf = (node) => node.label || kindLabels[node.kind] || node.kind
    const colorOf = (node) => zones.find((zone) => zone.id === node.zone)?.color
    const fmt = (value) => number.format(value || 0)
    const countOf = (value, cn, one, many) => fmt(value) + t(cn, ' ' + (value === 1 ? one : many))
    const clock = (time) => time ? new Date(time).toLocaleTimeString(zh ? 'zh' : 'en', { hour12: false }) : ''
    const durationOf = (ms) => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'
    const statusLabel = {
      failed: t('失败', 'Failed'), interrupted: t('中断', 'Interrupted'),
      done: t('完成', 'Done'), running: t('运行中', 'Running'),
    }

    function Graph({ nodes, model, selection, onSelect }) {
      const svg = useRef(null)
      const drag = useRef(null)
      const moved = useRef(false)
      const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
      const [dragging, setDragging] = useState(false)
      function point(clientX, clientY) {
        const transform = svg.current?.getScreenCTM()
        return transform ? new DOMPoint(clientX, clientY).matrixTransform(transform.inverse()) : null
      }
      function zoom(factor, x = 260, y = 215) {
        setView((old) => {
          const scale = Math.max(.75, Math.min(4, old.scale * factor))
          return { scale, x: x - (x - old.x) * scale / old.scale, y: y - (y - old.y) * scale / old.scale }
        })
      }
      useEffect(() => {
        const element = svg.current
        const wheel = (event) => {
          event.preventDefault()
          const at = point(event.clientX, event.clientY)
          if (at) zoom(Math.exp(-event.deltaY * .0015), at.x, at.y)
        }
        element.addEventListener('wheel', wheel, { passive: false })
        return () => element.removeEventListener('wheel', wheel)
      }, [])
      const layout = useMemo(() => zones.map((zone, quadrant) => {
        const all = nodes.filter((node) => node.zone === zone.id)
        const included = all.slice(0, 6)
        const start = [-180, -90, 0, 90][quadrant]
        const polar = (angle, radius) => ({ x: 260 + Math.cos(angle * Math.PI / 180) * radius, y: 215 + Math.sin(angle * Math.PI / 180) * radius })
        const placed = included.map((node, index) => {
          const wedge = 82 / included.length
          const angle = start + 4 + (index + .5) * wedge
          const pos = polar(angle, index % 2 ? 127 : 105)
          const dots = [...node.dots].sort((a, b) => b.running - a.running || b.failed - a.failed || b.seq - a.seq).slice(0, 10)
          return {
            node, ...pos,
            dots: dots.map((dot, i) => ({ dot, ...polar(angle + ((i + .5) / dots.length - .5) * wedge * .88, 153 + i % 3 * 13) })),
          }
        })
        return { ...zone, all: all.length, placed }
      }), [nodes])
      const activate = (action) => (event) => {
        if (event.type === 'keydown') {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
        } else if (moved.current && event.detail) return
        action()
      }
      const button = (label, action, tabIndex) => ({
        role: 'button', 'aria-label': label, tabIndex, onClick: activate(action), onKeyDown: activate(action),
      })
      const stopDrag = () => {
        drag.current = null
        setDragging(false)
      }
      return h('div', { className: 'awv-map' },
        h('div', { className: 'awv-maphead' },
          h('strong', null, t('能力图', 'Capability map')),
          h('div', null,
            h('span', null, Math.round(view.scale * 100) + '%'),
            h('button', { type: 'button', className: 'awv-button', 'aria-label': t('缩小', 'Zoom out'), onClick: () => zoom(1 / 1.3) }, '−'), ' ',
            h('button', { type: 'button', className: 'awv-button', 'aria-label': t('放大', 'Zoom in'), onClick: () => zoom(1.3) }, '+'), ' ',
            h('button', { type: 'button', className: 'awv-button', onClick: () => setView({ scale: 1, x: 0, y: 0 }) }, t('复位', 'Reset')),
          ),
        ),
        h('svg', {
          ref: svg, viewBox: '0 0 520 430', className: dragging ? 'is-drag' : '',
          role: 'group', 'aria-label': t('能力和对象', 'Capabilities and objects'),
          onPointerDown: (event) => {
            if (event.button !== 0 || drag.current) return
            moved.current = false
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view }
          },
          onPointerMove: (event) => {
            const start = drag.current
            if (!start || start.id !== event.pointerId) return
            if (!moved.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
            if (!moved.current) {
              moved.current = true
              svg.current.setPointerCapture(event.pointerId)
              setDragging(true)
            }
            const from = point(start.x, start.y)
            const to = point(event.clientX, event.clientY)
            if (from && to) setView({ ...start.view, x: start.view.x + to.x - from.x, y: start.view.y + to.y - from.y })
          },
          onPointerUp: stopDrag, onPointerCancel: stopDrag, onLostPointerCapture: stopDrag,
          onPointerLeave: () => { if (!moved.current) stopDrag() },
        },
          h('g', { transform: 'translate(' + view.x + ' ' + view.y + ') scale(' + view.scale + ')' },
            ...[72, 128, 180].map((r) => h('circle', { key: r, cx: 260, cy: 215, r, fill: 'none', stroke: '#34475f', strokeDasharray: '2 5' })),
            layout.map((zone) => h('g', { key: zone.id },
              h('rect', { x: zone.x + 8, y: zone.y + 7, width: 244, height: 200, rx: 14, fill: zone.color, opacity: .038 }),
              h('text', { x: zone.x + (zone.x ? 239 : 21), y: zone.y + 29, textAnchor: zone.x ? 'end' : 'start', fill: zone.color, fontSize: 13, fontWeight: 650 }, zone.label + '  ' + zone.all),
              zone.placed.map(({ node, x, y, dots }) => {
                const selected = selection?.cap === node.id
                const r = 7 + Math.min(7, Math.log2(node.count + 1) * 2)
                return h('g', { key: node.id },
                  h('line', { x1: 260, y1: 215, x2: x, y2: y, stroke: zone.color, strokeWidth: node.running ? 1.8 : 1, opacity: node.running || selected ? .9 : .4 }),
                  dots.map(({ dot, x: dx, y: dy }) => {
                    const color = dot.failed ? '#fb8397' : zone.color
                    return h('g', { key: dot.id },
                      h('line', { x1: x, y1: y, x2: dx, y2: dy, stroke: color, opacity: selected || dot.running ? .55 : .22 }),
                      h('g', button(dot.label, () => onSelect({ cap: node.id, dot: dot.id }), -1),
                        h('circle', { cx: dx, cy: dy, r: 7, fill: 'transparent' }),
                        h('circle', { cx: dx, cy: dy, r: selection?.dot === dot.id ? 5.6 : Math.min(4.4, 2.4 + Math.log2(dot.hits)), fill: color, opacity: selected || dot.failed ? 1 : .75, className: dot.running ? 'awv-live-dot' : '' }),
                        h('title', null, dot.label),
                      ),
                    )
                  }),
                  h('g', button(labelOf(node), () => onSelect({ cap: node.id }), 0),
                    h('circle', { className: 'awv-ring', cx: x, cy: y, r: r + 4, stroke: zone.color, fill: 'none', opacity: selected || node.running ? .9 : .22 }),
                    h('circle', { cx: x, cy: y, r, fill: zone.color }),
                    node.failed ? h('circle', { cx: x + r * .75, cy: y - r * .75, r: 3.2, fill: '#fb8397' }) : null,
                    h('text', { x, y: y + r + 13, textAnchor: 'middle', fill: '#ecf2ff', stroke: '#101b2e', strokeWidth: 3, paintOrder: 'stroke', fontSize: 11, pointerEvents: 'none' }, short(labelOf(node), 15)),
                  ),
                )
              }),
            )),
            h('circle', { cx: 260, cy: 215, r: 45, fill: '#16263d', stroke: '#58729c' }),
            h('text', { x: 260, y: 212, textAnchor: 'middle', fill: '#eef3ff', fontSize: 14, fontWeight: 650 }, t('模型', 'Model')),
            h('text', { x: 260, y: 231, textAnchor: 'middle', fill: '#a7b9d6', fontSize: 10 }, countOf(model.requests, ' 次响应', 'reply', 'replies')),
          ),
        ),
        h('div', { className: 'awv-mapfoot' }, t('小点代表对象 · 拖动平移', 'Dots are objects · Drag to pan'), h('i', { className: 'awv-key' }), t('有失败', 'Failed at least once')),
      )
    }

    function Inspector({ data, selection, select, jump, failures }) {
      const node = data.nodes.find((entry) => entry.id === selection?.cap)
      const dot = node?.dots.find((entry) => entry.id === selection?.dot)
      const [elapsed, setElapsed] = useState(() => Date.now())
      const active = Boolean(data.active.length)
      useEffect(() => {
        if (!active) return
        setElapsed(Date.now())
        const timer = setInterval(() => { if (!document.hidden) setElapsed(Date.now()) }, 1000)
        return () => clearInterval(timer)
      }, [active])
      function metric(label, value, onClick) {
        return h(onClick ? 'button' : 'div', { className: 'awv-metric', type: onClick ? 'button' : undefined, onClick },
          h('b', null, value), h('span', null, label))
      }
      const list = (rows) => h('div', { className: 'awv-list' }, rows)
      function row(key, title, value, action, color, pressed) {
        return h('button', { key, type: 'button', title, onClick: action, 'aria-pressed': pressed },
          color ? h('i', { style: { '--dot': color } }) : null, h('b', null, title), h('span', null, value))
      }
      return h('aside', { className: 'awv-inspector', 'aria-label': t('会话活动', 'Session activity') },
        h('div', { className: 'awv-metrics' },
          metric(t('工具调用', 'Tool calls'), fmt(data.calls)),
          metric(t('失败', 'Failures'), fmt(data.failures), failures),
          metric(t('运行中', 'Running'), fmt(data.running)),
          metric(t('输入 / 输出', 'Tokens in / out'), fmt(data.model.input) + ' / ' + fmt(data.model.output)),
        ),
        active ? h(React.Fragment, null,
          h('h3', null, t('正在执行', 'Running now')),
          list(data.active.map((call) => row(call.seq, call.name + (call.summary ? ' · ' + call.summary : ''),
            Math.max(0, Math.floor((elapsed - call.time) / 1000)) + 's', () => jump(call.seq), '#68c9ad'))),
        ) : null,
        node ? h(React.Fragment, null,
          h('div', { className: 'awv-inspect-head' },
            h('h3', null, dot?.label || labelOf(node)),
            h('button', { type: 'button', className: 'awv-button', onClick: () => select(dot ? { cap: node.id } : null) }, t('返回', 'Back')),
          ),
          dot ? h(React.Fragment, null,
            dot.detail ? h('p', { className: 'awv-detail' }, dot.detail) : null,
            h('p', { className: 'awv-secondary' }, countOf(dot.hits, ' 次调用', 'call', 'calls') + ' · ' + fmt(dot.failed) + t(' 次失败', ' failed')),
            dot.timed ? h('p', { className: 'awv-secondary' }, t('平均 ', 'Average ') + durationOf(dot.totalMs / dot.timed)) : null,
            h('div', { className: 'awv-actions' },
              h('button', { type: 'button', className: 'awv-button', onClick: () => jump(dot.seq) }, t('在时间线中查看', 'Open in timeline')),
              dot.failureSeq != null && dot.failureSeq !== dot.seq
                ? h('button', { type: 'button', className: 'awv-button', onClick: () => jump(dot.failureSeq) }, t('查看最近失败', 'Open last failure')) : null,
            ),
          ) : h(React.Fragment, null,
            h('p', { className: 'awv-secondary' }, countOf(node.count, ' 个对象', 'object', 'objects') + ' · ' + countOf(node.hits, ' 次调用', 'call', 'calls')),
            list(node.dots.map((item) => row(item.id, item.label, fmt(item.hits) + '×', () => select({ cap: node.id, dot: item.id }), item.failed ? '#fb8397' : colorOf(node)))),
            node.count > node.dots.length ? h('p', { className: 'awv-secondary' }, t('图中优先显示运行中、失败和最近的对象。完整记录可在时间线查看。', 'The graph prioritizes active, failed and recent objects. Use the timeline for more records.')) : null,
          ),
        ) : h(React.Fragment, null,
          h('h3', null, t('能力', 'Capabilities')),
          list(data.nodes.map((entry) => row(entry.id, labelOf(entry), countOf(entry.count, ' 个对象', 'object', 'objects'), () => select({ cap: entry.id }), colorOf(entry)))),
          !data.calls ? h('p', { className: 'awv-secondary' }, t('这个会话还没有工具调用。', 'This session has no tool calls yet.')) : null,
        ),
      )
    }

    function FeedRow({ item, selected }) {
      if (item.kind === 'turn') {
        const label = item.phase === 'start' ? t('开始', 'Started') : t('结束', 'Ended')
        return h('div', { className: 'awv-turn' }, t('第 ', 'Turn ') + item.turn + t(' 轮 · ', ' · ') + label)
      }
      const call = item.kind === 'call'
      const result = item.result
      const status = result?.status || (call ? 'running' : '')
      const duration = call && result?.time && item.time ? Math.max(0, result.time - item.time) : null
      const name = item.name || ({ user: t('你', 'You'), reply: t('模型回复', 'Model reply'), result: t('工具结果', 'Tool result') })[item.kind]
      return h('article', { className: 'awv-row awv-' + status + (selected ? ' awv-focus' : ''), 'data-seq': item.seq },
        h('div', { className: 'awv-rowhead' },
          h('strong', null, name),
          status ? h('span', { className: status === 'failed' ? 'awv-bad' : 'awv-secondary' },
            statusLabel[status] + (duration === null ? '' : ' · ' + durationOf(duration))) : null,
          h('time', null, clock(item.time)),
        ),
        item.text || item.summary ? h('p', null, item.text || item.summary) : null,
        result?.error ? h('p', { className: 'awv-bad' }, result.error) : null,
        result?.text ? h('details', null, h('summary', null, t('结果摘要', 'Result excerpt')), h('p', null, result.text)) : null,
      )
    }

    function Panel({ root, close }) {
      const [tab, setTab] = useState('map')
      const [focus, setFocus] = useState(root)
      const [sessions, setSessions] = useState([])
      const [filter, setFilter] = useState('all')
      const [cursor, setCursor] = useState(null)
      const [selection, select] = useState(null)
      const list = useRef(null)
      const closeRef = useRef(null)
      const scrolled = useRef(undefined)
      const map = tab === 'map'
      const query = { root, focus }
      if (!map) {
        query.filter = filter
        if (cursor) query[cursor.key] = cursor.seq
      }
      const { data, error } = useData(map ? 'map' : 'snapshot', query, map || !cursor)
      useEffect(() => { if (data?.sessions) setSessions(data.sessions) }, [data?.sessions])
      useEffect(() => {
        closeRef.current?.focus()
        const escape = (event) => {
          if (event.key === 'Escape') close()
        }
        document.addEventListener('keydown', escape)
        return () => document.removeEventListener('keydown', escape)
      }, [close])
      useEffect(() => {
        if (map || !data || scrolled.current === data.focus + ':' + filter + ':' + cursor?.key + ':' + cursor?.seq) return
        scrolled.current = data.focus + ':' + filter + ':' + cursor?.key + ':' + cursor?.seq
        if (cursor?.key === 'at') list.current?.querySelector('[data-seq="' + cursor.seq + '"]')?.scrollIntoView({ block: 'center' })
        else if (list.current) list.current.scrollTop = cursor ? 0 : list.current.scrollHeight
      }, [map, cursor, data, filter])
      function openTimeline(kind, at = null) {
        scrolled.current = undefined
        setFilter(kind)
        setCursor(at)
        setTab('timeline')
      }
      const jump = (seq) => openTimeline('all', { key: 'at', seq })
      const switchSession = (event) => {
        setFocus(event.target.value)
        setCursor(null)
        select(null)
      }
      const status = error === '404' ? t('找不到这个会话。', 'This session could not be found.')
        : error === '401' || error === '403' ? t('会话访问已失效，请刷新 Harness 后重试。', 'Session access expired. Reload Harness to try again.')
          : t('暂时无法读取活动。', 'Activity is temporarily unavailable.')
      return h('section', { className: 'awv', role: 'dialog', 'aria-label': t('工作流', 'Workflow') },
        h('style', null, CSS),
        h('div', { className: 'awv-header' },
          h('span', { className: 'awv-mark', 'aria-hidden': true }, '◇'),
          h('div', { className: 'awv-title' },
            h('h2', null, t('工作流', 'Workflow')),
            h('div', { className: 'awv-model' }, data?.model.name || t('DeepSeek Harness 会话', 'DeepSeek Harness session'))),
          sessions.length > 1 ? h('select', { className: 'awv-select', value: focus, onChange: switchSession, 'aria-label': t('会话', 'Session') },
            sessions.map((session) => h('option', { key: session.id, value: session.id },
              session.depth === 0 ? t('当前会话', 'Current session') : '·'.repeat(Math.min(session.depth, 6)) + ' ' + (session.label || t('子 Agent ', 'Subagent ') + session.id.slice(-8)))),
          ) : null,
          h('button', { className: 'awv-close', ref: closeRef, type: 'button', onClick: close, 'aria-label': t('关闭工作流', 'Close workflow') }, '×'),
        ),
        h('nav', { className: 'awv-nav', 'aria-label': t('工作流视图', 'Workflow views') },
          h('button', { type: 'button', 'aria-pressed': map, onClick: () => setTab('map') }, t('概览', 'Overview')),
          h('button', { type: 'button', 'aria-pressed': !map, onClick: () => openTimeline('all') }, t('时间线', 'Timeline')),
        ),
        error ? h('p', { className: 'awv-error', role: 'status' }, status,
          !map && cursor ? ' ' : null,
          !map && cursor ? h('button', { className: 'awv-button', type: 'button', onClick: () => setCursor(null) }, t('回到最新记录', 'Back to latest')) : null,
        ) : null,
        data?.partial ? h('div', { className: 'awv-note awv-secondary' }, t('显示近期会话活动。', 'Showing recent session activity.')) : null,
        !data ? (!error ? h('p', { className: 'awv-note', role: 'status' }, t('正在读取活动…', 'Loading activity…')) : null)
          : map ? h('div', { className: 'awv-main' },
            h(Graph, { key: focus, nodes: data.nodes, model: data.model, selection, onSelect: select }),
            h(Inspector, { data, selection, select, jump, failures: () => openTimeline('failed') }),
          ) : h('div', { className: 'awv-timeline' },
            h('div', { className: 'awv-controls' },
              [['all', t('全部', 'All')], ['tools', t('工具', 'Tools')], ['failed', t('失败', 'Failures')]].map(([id, label]) =>
                h('button', { key: id, type: 'button', className: 'awv-button', 'aria-pressed': id === filter, onClick: () => openTimeline(id) }, label)),
              h('div', { className: 'awv-page' },
                data.older != null ? h('button', { type: 'button', className: 'awv-button', onClick: () => setCursor({ key: 'before', seq: data.older }) }, t('更早', 'Older')) : null,
                data.newer != null ? h('button', { type: 'button', className: 'awv-button', onClick: () => setCursor({ key: 'after', seq: data.newer }) }, t('更新', 'Newer')) : null,
                cursor ? h('button', { type: 'button', className: 'awv-button', onClick: () => setCursor(null) }, t('最新', 'Latest')) : null,
              ),
            ),
            h('div', { className: 'awv-feed', ref: list },
              data.items.length ? data.items.map((item) => h(FeedRow, { key: item.seq, item, selected: cursor?.key === 'at' && cursor.seq === item.seq }))
                : h('p', { className: 'awv-note' }, data.missing ? t('这条记录已超出当前可回看的范围。', 'This record is outside the available history.') : t('没有符合条件的记录。', 'No matching activity.')),
            ),
          ),
      )
    }

    let launcher = null
    function close() {
      update({ open: false })
      launcher?.focus()
    }
    function Overlay() {
      const current = useViewer()
      return current.open && current.session ? h(Panel, { key: current.session, root: current.session, close }) : null
    }
    function Launcher({ sessionId }) {
      const current = useViewer()
      const ref = useRef(null)
      const open = current.open && current.session === sessionId
      useEffect(() => {
        if (state.open && sessionId && state.session !== sessionId) update({ session: sessionId })
      }, [sessionId])
      return h('button', {
        type: 'button', className: 'awv-launch', 'aria-pressed': open, disabled: !sessionId, ref,
        style: { border: '1px solid currentColor', background: 'transparent', borderRadius: 8, padding: '2px 8px', color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
        onClick: () => {
          launcher = ref.current
          if (open) close()
          else update({ open: true, session: sessionId })
        },
      }, '◇ ', t('工作流', 'Workflow'))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'agent-workflow-viewer', order: 40, label: () => t('工作流', 'Workflow') }, Launcher))
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'agent-workflow-viewer-overlay', order: 400 }, Overlay))
      },
    }
  },
})
