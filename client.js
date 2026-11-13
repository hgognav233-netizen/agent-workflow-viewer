window.__ModuleLoader__.load({
  id: 'agent-workflow-viewer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React
    const zh = (document.documentElement.lang || navigator.language).toLowerCase().startsWith('zh')
    const t = (cn, en) => zh ? cn : en
    const number = new Intl.NumberFormat(zh ? 'zh' : 'en', { notation: 'compact', maximumFractionDigits: 1 })
    const zones = [
      { id: 'web', label: t('网络', 'Web') },
      { id: 'external', label: t('外部服务', 'External') },
      { id: 'process', label: t('本机进程', 'Processes') },
      { id: 'disk', label: t('本机磁盘', 'Files & skills') },
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
      '.awv-header{padding:16px 20px 13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.awv-header h2{font-size:19px;letter-spacing:-.035em;margin:0;line-height:1.2}.awv-model{color:var(--aw-muted);font-size:12px;overflow-wrap:anywhere}.awv-title{flex:1;min-width:115px}.awv-mark{width:35px;height:35px;display:grid;place-items:center;background:#1a1a1a;color:#fdfdfb;border-radius:10px;font-size:20px}.awv-close,.awv-button,.awv-select{background:var(--aw-bg);border:1px solid var(--aw-line);border-radius:8px;padding:5px 10px}.awv-close{font-size:18px!important;line-height:1}.awv-button:hover,.awv-close:hover{border-color:var(--aw-brand)}.awv-select{max-width:230px}.awv-inspect-head{margin-bottom:8px}',
      '.awv-nav{display:flex;gap:18px;padding:0 20px;border-bottom:1px solid var(--aw-line);flex:none}.awv-nav button{background:none;border:0;border-bottom:2px solid transparent;padding:8px 1px;color:var(--aw-muted)}.awv-nav [aria-pressed=true]{border-color:var(--aw-brand);color:var(--aw-text);font-weight:650}',
      '.awv-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(200px,25%);flex:1;min-height:0}.awv-map{min-width:0;min-height:0;display:flex;flex-direction:column;background:#fdfdfb;color:#171717;position:relative;overflow:hidden;border-right:1px solid #e1e1dd}.awv-maphead{padding:13px 16px 8px;display:flex;align-items:center;justify-content:space-between;gap:6px;border-bottom:1px solid #eeeeeb}.awv-maphead strong{font-size:13px}.awv-maphead .awv-button,.awv-popover .awv-button{background:white;border-color:#d9d9d5;color:#171717;padding:3px 8px}.awv-maphead span{font:11px ui-monospace,monospace;color:#555;margin-right:6px}.awv-plot{flex:1;min-height:0;position:relative;isolation:isolate;overflow:hidden}.awv-plot svg{height:100%;width:100%;display:block;touch-action:none;cursor:grab;user-select:none}.awv-plot svg.is-drag{cursor:grabbing}.awv-plot svg [role=button]{cursor:pointer;outline:none}.awv-plot svg [role=button]:focus-visible .awv-ring{opacity:1;stroke-width:1.5}.awv-mapfoot{padding:8px 16px 10px;color:#585858;font-size:11px;border-top:1px solid #eeeeeb}.awv-key{display:inline-block;width:7px;height:7px;box-sizing:border-box;border:1px solid #191919;border-radius:50%;background:white;margin:0 4px 0 12px}',
      '.awv-wire,.awv-flow,.awv-guide,.awv-ring{fill:none;vector-effect:non-scaling-stroke;pointer-events:none}.awv-guide{stroke:#a4a49b;stroke-width:.5;stroke-dasharray:1 4;opacity:.5}.awv-wire{stroke:#181818;stroke-width:.65;opacity:.18;transition:opacity .18s}.awv-wire.is-branch{stroke-width:.85;opacity:.38}.awv-wire.is-focus{stroke-width:1;opacity:.85}.awv-wire.is-dim{opacity:.09}.awv-flow{stroke:#131313;stroke-width:1.3;stroke-dasharray:3 19;stroke-linecap:round;opacity:.9}.awv-ring{stroke:#171717;opacity:0}.awv-ring.is-on{opacity:1}.awv-ink{stroke:#171717;vector-effect:non-scaling-stroke}.awv-label{fill:#383838;pointer-events:none;font-family:"IBM Plex Mono",ui-monospace,monospace;paint-order:stroke;stroke:#fdfdfb;stroke-width:2.4;stroke-linejoin:round}.awv-dot:hover .awv-ring{opacity:1}.awv-dot.is-active .awv-ring{opacity:.62}.awv-zone-label{fill:#53534e;font:9px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.08em}',
      '.awv-popover{z-index:3;position:absolute;width:min(235px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;overscroll-behavior:contain;padding:12px;border:1px solid #777773;background:#fff;color:#171717;box-shadow:0 8px 24px #15151520;border-radius:5px;transform-origin:var(--aw-origin) center}.awv-popover h3{font-size:14px;margin:0;overflow-wrap:anywhere}.awv-popover p{margin:5px 0;overflow-wrap:anywhere;color:#494949}.awv-popover .awv-inspect-head{align-items:flex-start;margin:0}.awv-popover .awv-close{border-color:#ddd;background:white;color:#171717;padding:2px 5px}.awv-popover .awv-detail{font:11px/1.5 "IBM Plex Mono",ui-monospace,monospace}.awv-popover .awv-actions{margin:10px 0 0}.awv-tether{position:absolute;width:var(--aw-length);height:1px;background:#343434;transform:rotate(var(--aw-angle));transform-origin:left center;z-index:2;pointer-events:none}',
      '.awv-inspector{overflow:auto;padding:15px;min-width:0;background:var(--aw-bg)}.awv-inspector h3{font-size:13px;margin:0 0 8px}.awv-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:18px}.awv-metric{border:1px solid var(--aw-line);background:var(--aw-soft);padding:7px 9px;border-radius:9px;min-width:0;text-align:left}.awv-metric b{display:block;font-size:18px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.3}.awv-metric span,.awv-secondary{color:var(--aw-muted);font-size:11px}.awv-bad{color:var(--aw-red)}.awv-inspect-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.awv-list{display:grid;gap:5px;margin:0 0 15px}.awv-list button{background:var(--aw-bg);border:1px solid var(--aw-line);border-radius:8px;text-align:left;padding:7px 9px;display:flex;align-items:center;gap:7px;min-width:0}.awv-list button:hover,.awv-list button[aria-pressed=true]{border-color:var(--aw-brand);background:var(--aw-soft)}.awv-list i{width:7px;height:7px;flex:none;border-radius:50%;background:var(--dot)}.awv-list b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.awv-list span{white-space:nowrap;color:var(--aw-muted);font-size:11px}.awv-detail{overflow-wrap:anywhere;margin:0 0 12px}.awv-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}',
      '.awv-timeline{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--aw-soft)}.awv-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 16px;border-bottom:1px solid var(--aw-line);background:var(--aw-bg)}.awv-controls [aria-pressed=true]{color:var(--aw-brand);border-color:var(--aw-brand)}.awv-page{margin-left:auto;display:flex;gap:5px}.awv-feed{overflow:auto;min-height:0;padding:12px 16px}.awv-row{padding:9px 12px;margin:0 0 6px;border:1px solid var(--aw-line);border-left:3px solid var(--aw-line);border-radius:9px;background:var(--aw-bg);overflow-wrap:anywhere}.awv-row.awv-failed{border-left-color:var(--aw-red)}.awv-row.awv-running{border-left-color:var(--aw-brand)}.awv-row.awv-focus{outline:2px solid var(--aw-brand);outline-offset:-1px}.awv-rowhead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.awv-rowhead time{margin-left:auto;font-size:11px;color:var(--aw-muted);font-variant-numeric:tabular-nums}.awv-row p{margin:4px 0;white-space:pre-wrap}.awv-row summary{cursor:pointer;color:var(--aw-muted)}.awv-turn{padding:5px 3px;color:var(--aw-muted);font-size:11px}.awv-note{padding:12px 16px;color:var(--aw-muted);margin:0}.awv-error{padding:7px 16px;border-bottom:1px solid var(--aw-line);color:var(--aw-red);margin:0}.awv-launch{border:1px solid currentColor;border-radius:8px;padding:3px 8px;background:transparent;font:inherit;font-size:12px;cursor:pointer;color:inherit;white-space:nowrap}.awv-launch[aria-pressed=true]{color:var(--dsw-alias-brand-primary,#3264db)}',
      '@media(max-width:680px){.awv{inset:8px 8px 46px;width:auto}.awv-header{padding:10px 12px}.awv-nav{padding:0 12px}.awv-main{display:flex;flex-direction:column;overflow:auto}.awv-map{flex:none;height:clamp(250px,48dvh,420px)}.awv-inspector{overflow:visible}.awv-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.awv-metric b{font-size:15px}.awv-select{max-width:145px}}',
      '@media(prefers-reduced-motion:no-preference){.awv-flow{animation:awv-stream 1.15s linear infinite}.awv-dot.is-active .awv-ring{animation:awv-pulse 1.45s ease-out infinite;transform-origin:center;transform-box:fill-box}.awv-dot .awv-ink{animation:awv-appear .28s ease-out both}.awv-popover{animation:awv-pop .24s cubic-bezier(.2,.75,.25,1) both}.awv-tether{animation:awv-appear .2s ease-out both}}@keyframes awv-stream{to{stroke-dashoffset:-44}}@keyframes awv-pulse{from{transform:scale(.8);opacity:.85}to{transform:scale(2);opacity:0}}@keyframes awv-pop{from{opacity:0;transform:translateX(var(--aw-slide)) scale(.94)}to{opacity:1;transform:none}}@keyframes awv-appear{from{opacity:0}to{opacity:1}}',
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
    const colorOf = (node) => ({ web: '#767672', external: '#454545', process: '#141414', disk: '#9a9a96' })[node.zone]
    const fmt = (value) => number.format(value || 0)
    const countOf = (value, cn, one, many) => fmt(value) + t(cn, ' ' + (value === 1 ? one : many))
    const clock = (time) => time ? new Date(time).toLocaleTimeString(zh ? 'zh' : 'en', { hour12: false }) : ''
    const durationOf = (ms) => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'
    const statusLabel = {
      failed: t('失败', 'Failed'), interrupted: t('中断', 'Interrupted'),
      done: t('完成', 'Done'), running: t('运行中', 'Running'),
    }

    const modelPoint = { x: 36, y: 244 }

    function curve(from, to, bend = 0) {
      const dx = to.x - from.x
      return 'M' + from.x + ' ' + from.y + ' C' + (from.x + dx * .5) + ' ' + (from.y + bend) +
        ' ' + (to.x - dx * .36) + ' ' + to.y + ' ' + to.x + ' ' + to.y
    }

    function layoutGraph(nodes) {
      const TOP = 24
      const BOTTOM = 462
      const DOT_X = 424
      const zoneHead = 20
      const gap = 7

      const lanes = zones.map((zone) => {
        const groups = nodes.filter((node) => node.zone === zone.id)
        return { zone, groups: groups.slice(0, 8).sort((a, b) => a.id.localeCompare(b.id)) }
      })
      const totalGroups = lanes.reduce((sum, lane) => sum + lane.groups.length, 0)
      const gaps = totalGroups * gap
      const usable = BOTTOM - TOP - lanes.length * zoneHead - gaps
      // Show every dot while the column can hold it; only crowding shrinks it per group.
      const floor = 5
      const all = lanes.reduce((sum, lane) => sum + lane.groups.reduce((count, node) => count + node.dots.length, 0), 0)
      const perGroup = usable / Math.max(1, all) < floor
        ? Math.max(1, Math.floor(usable / floor / Math.max(1, totalGroups)))
        : Number.MAX_SAFE_INTEGER
      const drawn = lanes.map((lane) => lane.groups.reduce((sum, node) => sum + Math.min(perGroup, node.dots.length), 0))
      const totalDots = drawn.reduce((sum, value) => sum + value, 0)
      const pitch = Math.max(floor, Math.min(11, usable / Math.max(1, totalDots)))

      let cursor = TOP
      return lanes.map(({ zone, groups }, lane) => {
        const top = cursor
        cursor += zoneHead
        let inner = cursor
        const placed = groups.map((node, index) => {
          const shown = node.dots.slice(0, perGroup)
          const height = Math.max(1, shown.length) * pitch
          const center = inner + height / 2
          const hub = { x: 211 + ((index * 61 + lane * 37) % 95), y: center }
          const dots = [...shown].sort((a, b) => a.id - b.id).map((dot, order) => ({
            dot, x: DOT_X, y: inner + (order + .5) * pitch,
          }))
          inner += height + gap
          return { node, hub, dots, pitch, hidden: Math.max(0, node.dots.length - shown.length) }
        })
        cursor = inner
        return { ...zone, top, count: groups.length, groups: placed, pitch }
      })
    }

    function ObjectDetails({ dot, jump }) {
      return h(React.Fragment, null,
        dot.detail ? h('p', { className: 'awv-detail' }, dot.detail) : null,
        h('p', { className: 'awv-secondary' },
          countOf(dot.hits, ' 次调用', 'call', 'calls') + ' · ' + fmt(dot.failed) + t(' 次失败', ' failed'),
          dot.running ? ' · ' + statusLabel.running : '',
        ),
        dot.timed ? h('p', { className: 'awv-secondary' }, t('平均 ', 'Average ') + durationOf(dot.totalMs / dot.timed)) : null,
        h('div', { className: 'awv-actions' },
          h('button', { type: 'button', className: 'awv-button', onClick: () => jump(dot.seq) }, t('在时间线中查看', 'Open in timeline')),
          dot.failureSeq != null && dot.failureSeq !== dot.seq
            ? h('button', { type: 'button', className: 'awv-button', onClick: () => jump(dot.failureSeq) }, t('查看最近失败', 'Open last failure')) : null,
        ),
      )
    }

    function PointCard({ plot, anchor, dot, view, close, jump, keyboard }) {
      const card = useRef(null)
      const [placement, place] = useState(null)
      useLayoutEffect(() => {
        const container = plot.current
        const trigger = anchor.current
        const panel = card.current
        if (!container || !trigger || !panel) return
        function position() {
          const bounds = container.getBoundingClientRect()
          const point = trigger.getBoundingClientRect()
          const x = (point.left + point.right) / 2 - bounds.left
          const y = (point.top + point.bottom) / 2 - bounds.top
          const w = panel.offsetWidth
          const height = panel.offsetHeight
          const padding = 8
          const gap = 17
          const right = bounds.width - x
          const left = right < w + gap && x > right
          const clamp = (value, limit) => Math.min(Math.max(padding, limit - padding), Math.max(padding, value))
          const top = clamp(y - Math.min(25, height / 2), bounds.height - height)
          const edge = clamp(x + (left ? -gap - w : gap), bounds.width - w)
          const visible = x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height
          place({ x, y, top, edge, left, w, height, visible })
        }
        position()
        const observer = new ResizeObserver(position)
        observer.observe(container)
        observer.observe(panel)
        return () => observer.disconnect()
      }, [anchor, plot, view, dot])
      useLayoutEffect(() => {
        if (keyboard && placement?.visible) card.current?.focus({ preventScroll: true })
      }, [keyboard, placement?.visible])
      const left = placement?.left
      const edge = placement?.edge ?? 0
      const top = placement?.top ?? 0
      const dx = placement ? (left ? edge + placement.w : edge) - placement.x : 0
      const dy = placement ? Math.min(top + placement.height - 4, Math.max(top + 4, placement.y)) - placement.y : 0
      return h(React.Fragment, null,
        placement?.visible ? h('span', { className: 'awv-tether', 'aria-hidden': true, style: {
          left: placement.x, top: placement.y, '--aw-length': Math.hypot(dx, dy) + 'px', '--aw-angle': Math.atan2(dy, dx) + 'rad',
        } }) : null,
        h('aside', { id: 'awv-point-card', ref: card, className: 'awv-popover', role: 'region', 'aria-label': dot.label, tabIndex: -1,
          style: { left: edge, top, visibility: placement?.visible ? 'visible' : 'hidden', '--aw-origin': left ? 'right' : 'left', '--aw-slide': left ? '9px' : '-9px' },
          onKeyDown: (event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } },
        },
          h('div', { className: 'awv-inspect-head' },
            h('h3', null, dot.label),
            h('button', { className: 'awv-close', type: 'button', onClick: close, 'aria-label': t('关闭对象详情', 'Close object details') }, '×'),
          ),
          h(ObjectDetails, { dot, jump }),
        ),
      )
    }

    function Graph({ nodes, model, selection, onSelect, jump }) {
      const svg = useRef(null)
      const plot = useRef(null)
      const drag = useRef(null)
      const anchor = useRef(null)
      const moved = useRef(false)
      const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
      const [dragging, setDragging] = useState(false)
      const [hover, setHover] = useState(null)
      const layout = useMemo(() => layoutGraph(nodes), [nodes])
      const selectedDot = nodes.find((node) => node.id === selection?.cap)?.dots.find((dot) => dot.id === selection?.dot)
      const popupDot = selection?.fromGraph ? selectedDot : null

      function point(clientX, clientY) {
        const transform = svg.current?.getScreenCTM()
        return transform ? new DOMPoint(clientX, clientY).matrixTransform(transform.inverse()) : null
      }
      function zoom(factor, x = 340, y = 242) {
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
      function closeCard() {
        onSelect(selection?.cap ? { cap: selection.cap } : null)
        anchor.current?.focus()
      }
      function hit(label, action, attrs = {}) {
        const activate = (event) => {
          if (event.type === 'keydown') {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
          } else if (moved.current && event.detail) return
          action(event)
        }
        return { role: 'button', 'aria-label': label, tabIndex: 0, onClick: activate, onKeyDown: activate, ...attrs }
      }
      function stopDrag() {
        drag.current = null
        setDragging(false)
      }
      function path(d, branch, active, focused, dim) {
        return h(React.Fragment, null,
          h('path', { d, className: 'awv-wire' + (branch ? ' is-branch' : '') + (focused ? ' is-focus' : '') + (dim ? ' is-dim' : '') }),
          active ? h('path', { d, className: 'awv-flow' }) : null,
        )
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
        h('div', { className: 'awv-plot', ref: plot },
          h('svg', {
            ref: svg, viewBox: '0 0 680 484', className: dragging ? 'is-drag' : '',
            role: 'group', 'aria-label': t('能力和对象', 'Capabilities and objects'),
            onKeyDown: (event) => { if (event.key === 'Escape' && popupDot) { event.stopPropagation(); closeCard() } },
            onClick: (event) => { if (event.target === svg.current && !moved.current && popupDot) closeCard() },
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
              [192, 208, 224, 240, 256, 272].map((x) => h('line', { key: x, x1: x, x2: x, y1: 18, y2: 466, className: 'awv-guide' })),
              layout.map(({ id, label, top, count, groups }) => h('g', { key: id },
                h('path', { d: 'M327 ' + (top + 16) + ' H655', className: 'awv-guide' }),
                h('text', { x: 650, y: top + 12, textAnchor: 'end', className: 'awv-zone-label' }, label + ' / ' + count),
                groups.map(({ node, hub, dots, pitch, hidden }) => {
                  const selected = selection?.cap === node.id
                  const r = 3.1 + Math.min(4, Math.log2(node.count + 1))
                  return h('g', { key: node.id },
                    path(curve(modelPoint, hub, (hub.y - modelPoint.y) * .16), true, node.running, selected, selection && !selected),
                    dots.map((entry) => {
                      const { dot, x, y } = entry
                      const focused = selection?.dot === dot.id || hover === dot.id
                      const spacious = pitch >= 8.5
                      const showLabel = !popupDot && (focused || dot.running || spacious || view.scale >= 1.6)
                      return h('g', { key: dot.id },
                        Array.from({ length: Math.min(4, dot.hits - 1) }, (_, i) => h('path', {
                          key: i, d: curve(hub, entry, (y - hub.y) * .16 + (i % 2 ? -1 : 1) * (i + 1) * 7),
                          className: 'awv-wire', opacity: .1,
                        })),
                        path(curve(hub, entry, (y - hub.y) * .16), false, dot.running, focused, selection && !selected && !focused),
                        h('g', hit(dot.label, (event) => {
                          if (popupDot?.id === dot.id) { closeCard(); return }
                          anchor.current = event.currentTarget.querySelector('.awv-ink')
                          onSelect({ cap: node.id, dot: dot.id, fromGraph: true, keyboard: event.type === 'keydown' })
                        }, {
                          className: 'awv-dot' + (dot.running ? ' is-active' : ''),
                          'aria-expanded': popupDot?.id === dot.id,
                          'aria-controls': popupDot?.id === dot.id ? 'awv-point-card' : undefined,
                          onPointerEnter: () => setHover(dot.id), onPointerLeave: () => setHover(null),
                          onFocus: () => setHover(dot.id), onBlur: () => setHover(null),
                        }),
                          h('circle', { cx: x, cy: y, r: 4, fill: 'transparent' }),
                          h('circle', { cx: x, cy: y, r: 6, className: 'awv-ring' + (focused ? ' is-on' : '') }),
                          h('circle', { cx: x, cy: y, r: Math.min(3.4, 1.9 + Math.log2(dot.hits + 1) * .55), className: 'awv-ink', fill: dot.failed ? '#fdfdfb' : '#171717' }),
                          h('title', null, dot.label),
                        ),
                        showLabel ? h('text', { x: x + 9, y: y + 3, className: 'awv-label', fontSize: focused ? 10 : 8, fontWeight: focused || dot.running ? 650 : 400 }, short(dot.label, 26)) : null,
                      )
                    }),
                    hidden ? h('text', {
                      x: 424, y: (dots.length ? dots[dots.length - 1].y + pitch : hub.y + 10) + 2,
                      className: 'awv-label', fontSize: 8,
                    }, '+' + hidden) : null,
                    h('g', hit(labelOf(node), () => {
                      onSelect(selected ? null : { cap: node.id })
                    }),
                      h('circle', { cx: hub.x, cy: hub.y, r: r + 4, fill: 'transparent' }),
                      h('circle', { cx: hub.x, cy: hub.y, r: r + 4, className: 'awv-ring' + (selected ? ' is-on' : '') }),
                      h('circle', { cx: hub.x, cy: hub.y, r, fill: '#161616' }),
                      h('text', { x: hub.x + 10, y: hub.y - 7, className: 'awv-label', fontSize: 10, fontWeight: 650 }, short(labelOf(node), 20)),
                    ),
                  )
                }),
              )),
              h('circle', { cx: modelPoint.x, cy: modelPoint.y, r: 6, fill: '#111' }),
              h('text', { x: modelPoint.x, y: modelPoint.y + 21, className: 'awv-label', fontSize: 12, fontWeight: 650 }, t('模型', 'Model')),
              h('text', { x: modelPoint.x, y: modelPoint.y + 35, className: 'awv-label', fontSize: 9 }, countOf(model.requests, ' 次响应', 'reply', 'replies')),
            ),
          ),
          popupDot ? h(PointCard, { key: popupDot.id, plot, anchor, dot: popupDot, view, close: closeCard, jump, keyboard: selection.keyboard }) : null,
        ),
        h('div', { className: 'awv-mapfoot' }, t('点小点看详情 · 拖动平移', 'Select a dot for details · Drag to pan'), h('i', { className: 'awv-key' }), t('有失败', 'Failed at least once')),
      )
    }

    function Inspector({ data, selection, select, jump, failures }) {
      const node = data.nodes.find((entry) => entry.id === selection?.cap)
      const dot = selection?.fromGraph ? null : node?.dots.find((entry) => entry.id === selection?.dot)
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
          dot ? h(ObjectDetails, { dot, jump }) : h(React.Fragment, null,
            h('p', { className: 'awv-secondary' }, countOf(node.count, ' 个对象', 'object', 'objects') + ' · ' + countOf(node.hits, ' 次调用', 'call', 'calls')),
            list(node.dots.map((item) => row(item.id, item.label, fmt(item.hits) + '×', () => select({ cap: node.id, dot: item.id }), item.failed ? '#a33c47' : colorOf(node)))),
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
          if (event.key === 'Escape' && !event.defaultPrevented) close()
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
        select(null)
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
            h(Graph, { key: focus, nodes: data.nodes, model: data.model, selection, onSelect: select, jump }),
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
