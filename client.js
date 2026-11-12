/**
 * Browser half: a floating "how this model works" map.
 *   - capability map: the model in the centre, everything it reaches out to as a node
 *   - zoomable / pannable SVG, colours per capability class, live pulse on the running call
 *   - timeline tab keeps the raw call log
 * All data comes from the Host half; nothing is folded from session events here.
 */

window.__ModuleLoader__.load({
  id: 'agent-workflow-viewer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React

    // ------------------------------------------------------------ tiny store

    const store = { open: false, sessionId: null, listeners: new Set() }

    function emit() {
      for (const listener of Array.from(store.listeners)) {
        try {
          listener()
        } catch (error) {
          /* a stale subscriber must not break the panel */
        }
      }
    }

    function update(patch) {
      Object.assign(store, patch)
      emit()
    }

    function subscribe(listener) {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }

    function useStoreState() {
      const [, force] = useState(0)
      useEffect(() => subscribe(() => force((value) => value + 1)), [])
      return store
    }

    // ------------------------------------------------------------- utilities

    const pad = (value) => String(value).padStart(2, '0')

    function clockOf(time) {
      if (!time) return ''
      const date = new Date(time)
      return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
    }

    function agoOf(now, time) {
      if (!time) return ''
      const seconds = Math.max(0, Math.round((now - time) / 1000))
      if (seconds < 60) return seconds + ' 秒前'
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return minutes + ' 分前'
      return Math.round(minutes / 60) + ' 小时前'
    }

    function durationOf(item) {
      if (!item.res || !item.res.time || !item.time) return ''
      const ms = item.res.time - item.time
      if (ms < 1000) return Math.max(1, Math.round(ms)) + 'ms'
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
      return Math.round(ms / 60000) + 'min'
    }

    function tokensOf(value) {      const number = Number(value) || 0
      if (number >= 1e6) return (number / 1e6).toFixed(1) + 'M'
      if (number >= 1000) return Math.round(number / 1000) + 'k'
      return String(number)
    }

    function shortId(id) {
      const text = String(id || '')
      const parts = text.split('-')
      return parts.length > 1 ? parts[parts.length - 1].slice(0, 8) : text.slice(0, 8)
    }

    function fmtMs(value) {
      const ms = Number(value) || 0
      if (ms < 1000) return Math.max(1, Math.round(ms)) + 'ms'
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
      return Math.round(ms / 60000) + 'min'
    }

    function textWidthOf(text) {
      let width = 0
      for (const ch of String(text)) width += ch.charCodeAt(0) > 127 ? 9.4 : 5.3
      return width
    }

    function dotLabelOf(dot) {
      const target = String(dot.target || '')
      if (target) {
        const parts = target.split(/[\\/]/).filter(Boolean)
        if (parts.length) return parts[parts.length - 1]
      }
      return String(dot.label || '')
    }

    // -------------------------------------------------------------- classes

    const KIND_META = {
      skill: { color: 'var(--dsw-alias-brand-primary)', name: '技能包' },
      mcp: { color: 'var(--dsw-alias-state-warn-primary)', name: 'MCP 服务器' },
      agent: { color: 'var(--dsw-alias-state-success-primary)', name: '子 agent' },
      tool: { color: 'var(--dsw-alias-label-primary)', name: '内置工具' },
      file: { color: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 55%, var(--dsw-alias-bg-base))', name: '本机文件' },
      shell: { color: 'var(--dsw-alias-state-idle-primary)', name: '终端/任务' },
      web: { color: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, var(--dsw-alias-state-success-primary))', name: '互联网' },
      memory: { color: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 70%, var(--dsw-alias-brand-primary))', name: '历史会话' },
      plugin: { color: 'var(--dsw-alias-state-error-primary)', name: '插件系统' },
      plan: { color: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, var(--dsw-alias-state-warn-primary))', name: '计划/目标' },
      deliver: { color: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-brand-primary))', name: '交付' },
    }

    const KIND_ORDER = ['skill', 'mcp', 'agent', 'web', 'file', 'shell', 'memory', 'tool', 'plan', 'plugin', 'deliver']

    function kindMeta(kind) {
      return KIND_META[kind] || { color: 'var(--dsw-alias-label-primary)', name: kind }
    }

    // ---------------------------------------------------------------- styles

    const CSS = `
.awv-root{font:12px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dsw-alias-label-primary);}
.awv-panel{position:fixed;top:48px;right:14px;bottom:64px;width:760px;max-width:calc(100vw - 28px);pointer-events:auto;
  display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.32);overflow:hidden;z-index:90;}
.awv-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex:none;}
.awv-title{font-weight:600;font-size:13px;}
.awv-live{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none;}
.awv-live.is-run{background:var(--dsw-alias-state-success-primary);animation:awv-pulse 1.6s ease-in-out infinite;}
@keyframes awv-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.awv-head-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);}
.awv-tabs{display:flex;gap:2px;background:var(--dsw-alias-bg-base);border-radius:8px;padding:2px;flex:none;}
.awv-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:2px 9px;border-radius:6px;cursor:pointer;}
.awv-tab.is-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.12);}
.awv-close{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;cursor:pointer;padding:2px 5px;border-radius:6px;}
.awv-close:hover{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}
.awv-body{flex:1;position:relative;min-height:0;display:flex;}
.awv-map{flex:1;min-height:0;position:relative;background:var(--dsw-alias-bg-base);cursor:grab;}
.awv-map.is-drag{cursor:grabbing;}
.awv-map svg{display:block;width:100%;height:100%;user-select:none;}
.awv-node{cursor:pointer;}
.awv-node text{pointer-events:none;}
.awv-leaf{cursor:pointer;}
.awv-leaf .awv-dot{transition:fill .15s ease;}
.awv-leaf:hover .awv-dot{fill:var(--dsw-alias-brand-primary);}
.awv-flow{stroke:var(--dsw-alias-state-success-primary);stroke-width:1.5;stroke-opacity:.95;stroke-dasharray:5 7;animation:awv-flow .9s linear infinite;}
@keyframes awv-flow{to{stroke-dashoffset:-24}}
.awv-livebox rect{filter:drop-shadow(0 2px 6px rgba(0,0,0,.18));}
.awv-row.is-focus{outline:1.6px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}
.awv-grow{animation:awv-grow .5s cubic-bezier(.2,.9,.3,1.2) both;transform-box:fill-box;transform-origin:center;}
@keyframes awv-grow{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}
.awv-halo{animation:awv-halo 1.7s ease-out infinite;transform-box:fill-box;transform-origin:center;}
@keyframes awv-halo{0%{transform:scale(.8);opacity:.6}70%{transform:scale(1.45);opacity:0}100%{transform:scale(1.45);opacity:0}}
.awv-zoombar{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:4px;z-index:2;}
.awv-zbtn{width:26px;height:26px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.awv-zbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}
.awv-legend{position:absolute;left:10px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px 10px;max-width:70%;pointer-events:none;font-size:9.5px;color:var(--dsw-alias-label-secondary);}
.awv-leg{display:inline-flex;align-items:center;gap:4px;}
.awv-leg i{width:7px;height:7px;border-radius:50%;display:inline-block;}
.awv-card{position:absolute;left:10px;top:10px;max-width:calc(100% - 60px);background:var(--dsw-alias-bg-layer-1);
  border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:7px 9px;box-shadow:0 8px 24px rgba(0,0,0,.16);z-index:2;}
.awv-card b{font-size:12px;}
.awv-card .awv-k{font-size:9.5px;color:var(--dsw-alias-label-secondary);margin-left:6px;}
.awv-card p{margin:3px 0 0;font-size:10.5px;color:var(--dsw-alias-label-secondary);word-break:break-word;}
.awv-card .awv-x{position:absolute;right:4px;top:2px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;}
.awv-card .awv-path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.4px;word-break:break-all;opacity:.72;}
.awv-actions{margin-top:5px;}
.awv-chip{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;padding:0 3px;margin:0 1px;border-radius:4px;cursor:pointer;text-decoration:underline dotted;}
.awv-chip:hover{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}
.awv-go{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:10px;padding:3px 8px;border-radius:6px;cursor:pointer;}
.awv-go:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}
.awv-feed{flex:1;overflow:auto;padding:8px 10px 14px;display:flex;flex-direction:column;gap:6px;}
.awv-row{border-left:3px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  border-radius:8px;padding:6px 9px;display:flex;flex-direction:column;gap:3px;}
.awv-row.k-user{border-left-color:var(--dsw-alias-brand-primary);}
.awv-row.k-reply{border-left-color:var(--dsw-alias-state-success-primary);}
.awv-row.k-call{border-left-color:var(--dsw-alias-label-secondary);}
.awv-row.k-dispatch{border-left-color:var(--dsw-alias-brand-primary);}
.awv-row.k-error{border-left-color:var(--dsw-alias-state-error-primary);}
.awv-top{display:flex;align-items:center;gap:6px;min-width:0;}
.awv-kind{font-size:10px;letter-spacing:.05em;color:var(--dsw-alias-label-secondary);flex:none;}
.awv-tool{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;
  background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);padding:0 5px;border-radius:5px;}
.awv-args{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);}
.awv-state{flex:none;font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}
.awv-state.is-ok{color:var(--dsw-alias-state-success-primary);}
.awv-state.is-bad{color:var(--dsw-alias-state-error-primary);}
.awv-text{white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.awv-text.is-short{-webkit-line-clamp:2;}
.awv-res{border-top:1px dashed var(--dsw-alias-border-l1);padding-top:3px;color:var(--dsw-alias-label-secondary);}
.awv-res.is-bad{color:var(--dsw-alias-state-error-primary);}
.awv-turn{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:9.5px;}
.awv-turn::before,.awv-turn::after{content:"";flex:1;height:1px;background:var(--dsw-alias-border-l1);}
.awv-empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:26px 10px;line-height:1.8;white-space:pre-wrap;}
.awv-foot{display:flex;align-items:center;gap:12px;padding:5px 12px;border-top:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-secondary);font-size:10px;font-variant-numeric:tabular-nums;flex:none;overflow:hidden;}
.awv-foot-err{color:var(--dsw-alias-state-error-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46%;}
.awv-launch{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:13px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);
  font:inherit;font-size:12px;line-height:1;white-space:nowrap;}
.awv-launch:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}
.awv-launch.is-open{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-label-primary);border-color:transparent;}
.awv-launch-glyph{color:var(--dsw-alias-brand-primary);font-size:9px;}
`

    // ------------------------------------------------------------------ data

    function useJson(url, enabled) {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        if (!enabled || !url) return undefined
        let alive = true
        let timer = null
        const tick = async () => {
          try {
            const response = await fetch(url, { headers: { accept: 'application/json' } })
            if (!response.ok) throw new Error('HTTP ' + response.status)
            const body = await response.json()
            if (!alive) return
            setData(body)
            setError(body && body.error ? String(body.error) : '')
          } catch (failure) {
            if (alive) setError(String((failure && failure.message) || failure))
          }
          if (alive) timer = setTimeout(tick, 1200)
        }
        tick()
        return () => {
          alive = false
          if (timer) clearTimeout(timer)
        }
      }, [url, enabled])
      return { data, error }
    }

    // ------------------------------------------------------------------- map

    const VB = { w: 760, h: 620, cx: 380, cy: 310, nodeR: 196, leafR: 250, labelR: 286 }

    const ZONES = [
      {
        id: 'cloud',
        name: '云端检索',
        kinds: ['web'],
        color: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, var(--dsw-alias-state-success-primary))',
      },
      {
        id: 'process',
        name: '本机进程',
        kinds: ['tool', 'agent', 'memory', 'plugin', 'plan', 'shell', 'deliver'],
        color: 'var(--dsw-alias-label-primary)',
      },
      {
        id: 'disk',
        name: '本机磁盘',
        kinds: ['skill', 'file'],
        color: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-label-secondary))',
      },
      {
        id: 'external',
        name: '外部程序',
        kinds: ['mcp'],
        color: 'var(--dsw-alias-state-warn-primary)',
      },
    ]

    function zoneOf(kind) {
      for (const zone of ZONES) if (zone.kinds.indexOf(kind) >= 0) return zone
      return ZONES[1]
    }

    function layoutMap(nodes) {
      const buckets = new Map()
      for (const zone of ZONES) buckets.set(zone.id, [])
      for (const node of nodes) buckets.get(zoneOf(node.kind).id).push(node)
      for (const list of buckets.values()) {
        list.sort((a, b) => {
          const rank = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
          return rank !== 0 ? rank : b.count - a.count
        })
      }

      const weight = (node) => Math.max(1, node.count || 1)
      const MIN_SLICE = 12
      const rawZones = ZONES.map((zone) => {
        const list = buckets.get(zone.id) || []
        return { zone, list, raw: Math.max(22, MIN_SLICE * list.length) }
      })
      const zoneTotal = rawZones.reduce((sum, entry) => sum + entry.raw, 0) || 1
      let cursor = -90
      const zones = rawZones.map((entry) => {
        const span = (entry.raw / zoneTotal) * 360
        const zone = { ...entry.zone, list: entry.list, start: cursor, span, middle: cursor + span / 2 }
        cursor += span
        return zone
      })

      const placed = []
      for (const zone of zones) {
        if (!zone.list.length) continue
        const zoneWeight = zone.list.reduce((sum, node) => sum + weight(node), 0) || 1
        const raws = zone.list.map((node) => Math.max(MIN_SLICE, zone.span * (weight(node) / zoneWeight)))
        const rawSum = raws.reduce((sum, value) => sum + value, 0) || 1
        let at = zone.start
        zone.list.forEach((node, index) => {
          const slice = (raws[index] / rawSum) * zone.span
          const middle = ((at + slice / 2) * Math.PI) / 180
          const leaves = []
          const objects = Array.isArray(node.dots) ? node.dots : []
          const dots = objects.length || Math.min(60, Math.max(0, node.count || 0))
          for (let index = 0; index < dots; index += 1) {
            const object = objects[index] || null
            const share = dots === 1 ? 0.5 : (index + 0.5) / dots
            const leafAngle = ((at + slice * (0.12 + 0.76 * share)) * Math.PI) / 180
            const leafRadius = VB.leafR + (index % 3) * 7
            const hits = object ? Math.max(1, object.hits || 1) : 1
            leaves.push({
              key: node.id + '-' + index,
              dotKey: object ? object.key || '' : '',
              index: index + 1,
              x: VB.cx + Math.cos(leafAngle) * leafRadius,
              y: VB.cy + Math.sin(leafAngle) * leafRadius,
              r: 1.4 + Math.min(2.6, Math.log2(1 + hits) * 0.9),
              fail: object ? (object.fail || 0) > 0 : false,
              fails: object ? object.fail || 0 : 0,
              hits,
              label: dotLabelOf(object || {}),
              target: object ? object.target || '' : '',
              seq: object ? object.seq || 0 : 0,
              time: object ? object.last || 0 : 0,
              ms: object ? object.ms || 0 : 0,
              last: index === dots - 1,
            })
          }
          placed.push({
            ...node,
            zone: zone.id,
            angle: middle,
            x: VB.cx + Math.cos(middle) * VB.nodeR,
            y: VB.cy + Math.sin(middle) * VB.nodeR,
            r: 4.6 + Math.min(8.4, Math.log2(1 + (node.count || 1)) * 2.8),
            leaves,
          })
          at += slice
        })
      }
      return { zones, nodes: placed }
    }

    function polar(angle, radius) {
      return { x: VB.cx + Math.cos(angle) * radius, y: VB.cy + Math.sin(angle) * radius }
    }

    function MapView({ map, error, onPickCall }) {
      const svgRef = useRef(null)
      const [view, setView] = useState({ k: 1, x: 0, y: 0 })
      const [picked, setPicked] = useState('')
      const [pickedDot, setPickedDot] = useState('')
      const [dragging, setDragging] = useState(false)
      const dragRef = useRef(null)
      const movedRef = useRef(0)
      const nodes = (map && map.nodes) || []
      const layout = useMemo(() => layoutMap(nodes), [nodes])
      const placed = layout.nodes
      const live = map && map.live
      const model = (map && map.model) || {}
      const pickedNode = placed.find((node) => node.id === picked)
      const liveCall = map && map.liveCall ? map.liveCall : null
      const now = (map && map.now) || Date.now()
      let liveLeaf = null
      if (liveCall) {
        for (const node of placed) {
          const found = node.leaves.find((leaf) => leaf.seq === liveCall.seq)
          if (found) {
            liveLeaf = found
            break
          }
        }
      }

      let pickedLeaf = null
      let pickedOwner = null
      if (pickedDot) {
        for (const node of placed) {
          const found = node.leaves.find((leaf) => leaf.dotKey === pickedDot)
          if (found) {
            pickedLeaf = found
            pickedOwner = node
            break
          }
        }
      }


      useEffect(() => {
        const element = svgRef.current
        if (!element) return undefined
        const onWheel = (event) => {
          event.preventDefault()
          const rect = element.getBoundingClientRect()
          if (!rect.width || !rect.height) return
          const scale = Math.min(rect.width / VB.w, rect.height / VB.h)
          const offsetX = (rect.width - VB.w * scale) / 2
          const offsetY = (rect.height - VB.h * scale) / 2
          const u = (event.clientX - rect.left - offsetX) / scale
          const v = (event.clientY - rect.top - offsetY) / scale
          setView((previous) => {
            const next = Math.min(6, Math.max(0.35, previous.k * Math.exp(-event.deltaY * 0.0016)))
            const ratio = next / previous.k
            return { k: next, x: u - (u - previous.x) * ratio, y: v - (v - previous.y) * ratio }
          })
        }
        element.addEventListener('wheel', onWheel, { passive: false })
        return () => element.removeEventListener('wheel', onWheel)
      }, [])

      const onPointerDown = (event) => {
        if (event.button !== 0) return
        dragRef.current = { x: event.clientX, y: event.clientY, view, captured: false, id: event.pointerId }
        movedRef.current = 0
        setDragging(false)
      }

      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        movedRef.current = Math.max(movedRef.current, Math.max(Math.abs(dx), Math.abs(dy)))
        if (!drag.captured && movedRef.current > 5) {
          drag.captured = true
          setDragging(true)
          if (svgRef.current && svgRef.current.setPointerCapture) {
            try {
              svgRef.current.setPointerCapture(drag.id)
            } catch {
              /* the pointer may already be gone */
            }
          }
        }
        if (!drag.captured) return
        const rect = svgRef.current.getBoundingClientRect()
        const scale = Math.min(rect.width / VB.w, rect.height / VB.h) || 1
        setView({
          k: drag.view.k,
          x: drag.view.x + dx / scale,
          y: drag.view.y + dy / scale,
        })
      }

      const onPointerUp = () => {
        const drag = dragRef.current
        if (drag && drag.captured && svgRef.current && svgRef.current.releasePointerCapture) {
          try {
            svgRef.current.releasePointerCapture(drag.id)
          } catch {
            /* ignore */
          }
        }
        dragRef.current = null
        setDragging(false)
      }

      const zoomBy = (factor) => setView((previous) => {
        const next = Math.min(6, Math.max(0.35, previous.k * factor))
        const ratio = next / previous.k
        return { k: next, x: VB.cx - (VB.cx - previous.x) * ratio, y: VB.cy - (VB.cy - previous.y) * ratio }
      })

      const showLabels = view.k >= 0.62

      const totalDots = placed.reduce((sum, node) => sum + node.leaves.length, 0)
      const denseZoom = totalDots > 30 ? 1.9 : totalDots > 18 ? 1.5 : totalDots > 8 ? 1.0 : 0.7
      const leafLabels = []
      for (const node of placed) {
        const forced = node.id === picked || node.id === live
        const roomy = node.leaves.length <= 8
        let list = node.leaves
        if (!forced && !roomy && view.k < denseZoom) {
          // too crowded at this zoom: only the most-repeated objects introduce themselves
          list = node.leaves
            .slice()
            .sort((one, two) => two.hits - one.hits)
            .slice(0, 4)
            .filter((leaf) => leaf.hits >= 2)
        }
        for (const leaf of list) {
          if (!leaf.label) continue
          const radius = Math.hypot(leaf.x - VB.cx, leaf.y - VB.cy)
          const angle = Math.atan2(leaf.y - VB.cy, leaf.x - VB.cx)
          const deg = (angle * 180) / Math.PI
          const right = Math.cos(angle) >= 0
          const point = polar(angle, radius + 5)
          leafLabels.push({
            key: leaf.key + '-lb',
            x: point.x,
            y: point.y,
            rot: right ? deg : deg - 180,
            anchor: right ? 'start' : 'end',
            text: leaf.label.length > 12 ? leaf.label.slice(0, 11) + '…' : leaf.label,
            forced,
          })
        }
      }

      let liveBox = null
      if (liveLeaf && liveCall) {
        const angle = Math.atan2(liveLeaf.y - VB.cy, liveLeaf.x - VB.cx)
        const elapsed = Math.max(0, (now - liveCall.t) / 1000)
        const head = liveCall.name + ' · ' + (elapsed < 60 ? elapsed.toFixed(1) + 's' : Math.round(elapsed / 60) + 'min')
        const body = liveCall.args
          ? liveCall.args.length > 34
            ? liveCall.args.slice(0, 33) + '…'
            : liveCall.args
          : '正在运行'
        const width = Math.max(textWidthOf(head), textWidthOf(body)) + 14
        const x = liveLeaf.x + Math.cos(angle) * 16
        const y = liveLeaf.y + Math.sin(angle) * 16
        let anchor = Math.cos(angle) >= 0 ? 'start' : 'end'
        if (anchor === 'start' && x + width > VB.w - 6) anchor = 'end'
        if (anchor === 'end' && x - width < 6) anchor = 'start'
        liveBox = { x, y, anchor, boxX: anchor === 'start' ? x - 6 : x - width, width, head, body }
      }

      return h(
        'div',
        { className: 'awv-map' + (dragging ? ' is-drag' : '') },
        h(
          'svg',
          {
            ref: svgRef,
            viewBox: '0 0 ' + VB.w + ' ' + VB.h,
            preserveAspectRatio: 'xMidYMid meet',
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerLeave: onPointerUp,
            role: 'img',
            'aria-label': '模型能力分区图',
          },
          h('g', { transform: 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')' },
            layout.zones.map((zone) => {
              const from = polar((zone.start * Math.PI) / 180, 158)
              const to = polar((zone.start * Math.PI) / 180, VB.leafR + 26)
              return h('line', {
                key: 'div-' + zone.id,
                x1: from.x, y1: from.y, x2: to.x, y2: to.y,
                stroke: 'var(--dsw-alias-label-primary)',
                strokeWidth: 0.4,
                strokeDasharray: '1 5',
                strokeOpacity: 0.3,
              })
            }),

            placed.map((node) =>
              node.leaves.map((leaf) =>
                h('line', {
                  key: 'le-' + leaf.key,
                  className: liveCall && leaf.seq === liveCall.seq ? 'awv-flow' : undefined,
                  x1: node.x, y1: node.y, x2: leaf.x, y2: leaf.y,
                  stroke: 'var(--dsw-alias-label-primary)',
                  strokeWidth: 0.35,
                  strokeOpacity: 0.16,
                }),
              ),
            ),

            placed.map((node) =>
              h('line', {
                key: 'ce-' + node.id,
                className: node.id === live ? 'awv-flow' : undefined,
                x1: VB.cx, y1: VB.cy, x2: node.x, y2: node.y,
                stroke: 'var(--dsw-alias-label-primary)',
                strokeWidth: Math.min(1.6, 0.35 + Math.log2(1 + (node.count || 1)) * 0.22),
                strokeOpacity: node.id === live ? 0.7 : 0.24,
              }),
            ),

            placed.map((node) =>
              node.leaves.map((leaf) =>
                h(
                  'g',
                  {
                    key: 'lc-' + leaf.key,
                    className: 'awv-leaf',
                    onClick: (event) => {
                      event.stopPropagation()
                      if (movedRef.current > 5) return
                      const id = leaf.dotKey || ''
                      if (!id) {
                        setPickedDot('')
                        setPicked(node.id)
                        return
                      }
                      setPicked('')
                      setPickedDot(id === pickedDot ? '' : id)
                    },
                  },
                  h('circle', { cx: leaf.x, cy: leaf.y, r: 4.4, fill: 'transparent' }),
                  liveCall && leaf.seq === liveCall.seq
                    ? h('circle', {
                        className: 'awv-halo',
                        cx: leaf.x, cy: leaf.y, r: leaf.r + 4,
                        fill: 'none', stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 1.2,
                      })
                    : null,
                  h('circle', {
                    className: 'awv-dot',
                    cx: leaf.x, cy: leaf.y,
                    r: leaf.r + (leaf.last ? 0.8 : 0),
                    fill: leaf.fail ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-primary)',
                    opacity: leaf.fail ? 0.95 : leaf.last ? 0.95 : 0.5,
                  }),
                  leaf.last
                    ? h('circle', {
                        cx: leaf.x, cy: leaf.y, r: leaf.r + 2.6,
                        fill: 'none', stroke: 'var(--dsw-alias-label-primary)', strokeWidth: 0.55, opacity: 0.75,
                      })
                    : null,
                  h(
                    'title',
                    null,
                    (leaf.label || '对象') +
                      (leaf.hits > 1 ? ' · ' + leaf.hits + ' 次' : '') +
                      (leaf.time ? ' · 最后 ' + clockOf(leaf.time) : '') +
                      (leaf.fail ? ' · 有失败' : '') +
                      '（点一下跳到时间线）',
                  ),
                ),
              ),
            ),

            leafLabels.map((row) =>
              h(
                'text',
                {
                  key: row.key,
                  x: row.x,
                  y: row.y,
                  transform: 'rotate(' + row.rot + ' ' + row.x + ' ' + row.y + ')',
                  textAnchor: row.anchor,
                  dominantBaseline: 'middle',
                  fontSize: 7.4,
                  fill: 'var(--dsw-alias-label-secondary)',
                  opacity: row.forced ? 0.95 : 0.72,
                  'pointer-events': 'none',
                },
                row.text,
              ),
            ),

            h(
              'g',
              { style: { transform: 'translate(' + VB.cx + 'px,' + VB.cy + 'px)' } },
              live ? h('circle', { className: 'awv-halo', r: 44, fill: 'none', stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 1.2 }) : null,
              h('circle', { r: 34, fill: 'var(--dsw-alias-bg-base)', stroke: 'var(--dsw-alias-label-primary)', strokeWidth: 1.4 }),
              h('text', { textAnchor: 'middle', y: 0, fontSize: 12, fontWeight: 600, fill: 'var(--dsw-alias-label-primary)' }, '模型'),
              h('text', { textAnchor: 'middle', y: 14, fontSize: 8, fill: 'var(--dsw-alias-label-secondary)', letterSpacing: 0.6 }, 'CLOUD API'),
              h(
                'text',
                { textAnchor: 'middle', y: 52, fontSize: 9.5, fill: 'var(--dsw-alias-label-secondary)' },
                (model.model || '未知模型') + (model.requests ? ' · ' + model.requests + ' 次请求' : ''),
              ),
            ),

            placed.map((node) => {
              const isLive = node.id === live
              const isPicked = node.id === picked
              return h(
                'g',
                {
                  key: node.id,
                  className: 'awv-node',
                  style: { transform: 'translate(' + node.x + 'px,' + node.y + 'px)', transition: 'transform .5s ease' },
                  onClick: (event) => {
                    event.stopPropagation()
                    if (movedRef.current > 5) return
                    setPickedDot('')
                    setPicked(node.id === picked ? '' : node.id)
                  },
                },
                isPicked ? h('circle', { r: node.r + 4, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 1.2 }) : null,
                isLive ? h('circle', { className: 'awv-halo', r: node.r + 5, fill: 'none', stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 1.2 }) : null,
                h('g', { className: 'awv-grow' },
                  h('circle', { r: node.r, fill: 'var(--dsw-alias-label-primary)' }),
                  node.fail ? h('circle', { r: node.r + 2.2, fill: 'none', stroke: 'var(--dsw-alias-state-error-primary)', strokeWidth: 0.9 }) : null,
                ),
              )
            }),

            placed.map((node) => {
              if (!showLabels && node.id !== picked && node.id !== live) return null
              const deg = (node.angle * 180) / Math.PI
              const right = Math.cos(node.angle) >= 0
              const point = polar(node.angle, VB.nodeR - node.r - 6)
              const text = node.label.length > 12 ? node.label.slice(0, 11) + '…' : node.label
              return h(
                'text',
                {
                  key: 'lb-' + node.id,
                  x: point.x,
                  y: point.y,
                  transform: 'rotate(' + (right ? deg : deg - 180) + ' ' + point.x + ' ' + point.y + ')',
                  textAnchor: right ? 'end' : 'start',
                  dominantBaseline: 'middle',
                  fontSize: 9.2,
                  fill: 'var(--dsw-alias-label-primary)',
                  opacity: node.id === picked || node.id === live ? 1 : 0.82,
                  'pointer-events': 'none',
                },
                text + (node.count > 1 ? '  ' + node.count : ''),
              )
            }),

            liveBox
              ? h(
                  'g',
                  { className: 'awv-livebox', 'pointer-events': 'none' },
                  h('rect', {
                    x: liveBox.boxX,
                    y: liveBox.y - 21,
                    width: liveBox.width,
                    height: 35,
                    rx: 7,
                    fill: 'var(--dsw-alias-bg-layer-1)',
                    stroke: 'var(--dsw-alias-state-success-primary)',
                    strokeWidth: 0.9,
                    opacity: 0.97,
                  }),
                  h(
                    'text',
                    {
                      x: liveBox.anchor === 'start' ? liveBox.boxX + 7 : liveBox.boxX + liveBox.width - 7,
                      y: liveBox.y - 9,
                      textAnchor: liveBox.anchor,
                      fontSize: 9.4,
                      fontWeight: 600,
                      fill: 'var(--dsw-alias-state-success-primary)',
                    },
                    liveBox.head,
                  ),
                  h(
                    'text',
                    {
                      x: liveBox.anchor === 'start' ? liveBox.boxX + 7 : liveBox.boxX + liveBox.width - 7,
                      y: liveBox.y + 4,
                      textAnchor: liveBox.anchor,
                      fontSize: 8.6,
                      fill: 'var(--dsw-alias-label-secondary)',
                    },
                    liveBox.body,
                  ),
                )
              : null,

            layout.zones.map((zone) => {
              const active = zone.list.length > 0
              const point = polar((zone.middle * Math.PI) / 180, VB.labelR)
              const text = zone.name + (active ? ' ' + zone.list.length : ' 0')
              const width = textWidthOf(text) + 10
              return h(
                'g',
                { key: 'zn-' + zone.id },
                h('rect', {
                  x: point.x - width / 2,
                  y: point.y - 7,
                  width,
                  height: 14,
                  rx: 3,
                  fill: 'var(--dsw-alias-bg-base)',
                  opacity: 0.86,
                }),
                h(
                  'text',
                  {
                    x: point.x, y: point.y + 3,
                    textAnchor: 'middle',
                    fontSize: 8.6,
                    letterSpacing: 1.4,
                    fill: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                    opacity: active ? 0.88 : 0.45,
                  },
                  text,
                ),
              )
            }),
          ),
        ),
        h(
          'div',
          { className: 'awv-zoombar' },
          h('button', { className: 'awv-zbtn', onClick: () => zoomBy(1.3), title: '放大' }, '+'),
          h('button', { className: 'awv-zbtn', onClick: () => zoomBy(1 / 1.3), title: '缩小' }, '−'),
          h('button', { className: 'awv-zbtn', onClick: () => setView({ k: 1, x: 0, y: 0 }), title: '复位' }, '⌂'),
        ),
        pickedLeaf && pickedOwner
          ? h(
              'div',
              { className: 'awv-card' },
              h('button', { className: 'awv-x', onClick: () => setPickedDot(''), 'aria-label': '关闭' }, '×'),
              h('b', null, pickedLeaf.label || '对象'),
              h('span', { className: 'awv-k' }, zoneOf(pickedOwner.kind).name + ' · ' + kindMeta(pickedOwner.kind).name),
              h(
                'p',
                null,
                '碰过 ' + pickedLeaf.hits + ' 次' +
                  (pickedLeaf.fails ? '（失败 ' + pickedLeaf.fails + ' 次）' : '') +
                  (pickedLeaf.ms ? ' · 累计 ' + fmtMs(pickedLeaf.ms) + ' · 平均 ' + fmtMs(pickedLeaf.ms / Math.max(1, pickedLeaf.hits)) : '') +
                  (pickedLeaf.time ? ' · 最后 ' + clockOf(pickedLeaf.time) : ''),
              ),
              pickedLeaf.target ? h('p', { className: 'awv-path' }, pickedLeaf.target) : null,
              h(
                'p',
                { className: 'awv-actions' },
                h(
                  'button',
                  {
                    className: 'awv-go',
                    onClick: () => {
                      if (pickedLeaf.seq) onPickCall(pickedLeaf.seq)
                    },
                  },
                  '在时间线里查看 →',
                ),
              ),
            )
          : pickedNode
            ? h(
              'div',
              { className: 'awv-card' },
              h('button', { className: 'awv-x', onClick: () => setPicked(''), 'aria-label': '关闭' }, '×'),
              h('b', null, pickedNode.label),
              h('span', { className: 'awv-k' }, zoneOf(pickedNode.kind).name + ' · ' + kindMeta(pickedNode.kind).name),
              h(
                'p',
                null,
                (pickedNode.count || 0) + ' 个不同对象 · 共 ' + (pickedNode.hits || pickedNode.count || 0) + ' 次调用 · 失败 ' + (pickedNode.fail || 0) +
                  (pickedNode.ms ? ' · 平均 ' + Math.round(pickedNode.ms / Math.max(1, pickedNode.hits || pickedNode.count || 1)) + 'ms' : '') +
                  (pickedNode.last ? ' · 最后 ' + clockOf(pickedNode.last) : ''),
              ),
              pickedNode.dots && pickedNode.dots.length
                ? h(
                    'p',
                    null,
                    '最近碰到：',
                    pickedNode.dots.slice(-5).map((dot) =>
                      h(
                        'button',
                        {
                          key: dot.key,
                          className: 'awv-chip',
                          onClick: () => {
                            setPicked('')
                            setPickedDot(dot.key)
                          },
                        },
                        dot.label + (dot.hits > 1 ? '(' + dot.hits + ')' : ''),
                      ),
                    ),
                  )
                : null,
              pickedNode.sub ? h('p', null, pickedNode.sub) : null,
              pickedNode.tools && pickedNode.tools.length ? h('p', null, '用到的工具：' + pickedNode.tools.join('、')) : null,
              pickedNode.sample ? h('p', null, '示例参数：' + pickedNode.sample) : null,
            )
          : null,
        h(
          'div',
          { className: 'awv-legend' },
          '每个小点 = 一个对象 · 缩放 ' + Math.round(view.k * 100) + '%' +
            (pickedLeaf ? ' · 已选：' + (pickedLeaf.label || '对象') : pickedNode ? ' · 已选：' + pickedNode.label : ' · 点小点看对象详情'),
        ),
        nodes.length === 0
          ? h('div', { className: 'awv-empty' }, error ? '读取失败：' + error : '还没有调用。\n我一开始干活，这张图就会长出节点。')
          : null,
      )
    }

    // -------------------------------------------------------------- timeline

    function FeedRow({ item, focused }) {
      const shell = (className, children) =>
        h(
          'div',
          { className: 'awv-row ' + className + (focused ? ' is-focus' : ''), 'data-seq': item.seq },
          children,
        )
      if (item.kind === 'turn') {
        const complete = item.phase === 'end' && item.reason === 'completed'
        const label =
          item.phase === 'start'
            ? '第 ' + item.turn + ' 轮'
            : complete
              ? '第 ' + item.turn + ' 轮结束'
              : '第 ' + item.turn + ' 轮 · ' + item.reason
        return h('div', { className: 'awv-turn' }, h('span', null, label))
      }
      if (item.kind === 'user') {
        return shell(
          'k-user',
          h(
            React.Fragment,
            null,
            h('div', { className: 'awv-top' }, h('span', { className: 'awv-kind' }, '你'), h('span', { className: 'awv-args' }, clockOf(item.time))),
            h('div', { className: 'awv-text' }, item.text),
          ),
        )
      }
      if (item.kind === 'reply') {
        return shell(
          'k-reply',
          h(
            React.Fragment,
            null,
            h(
              'div',
              { className: 'awv-top' },
              h('span', { className: 'awv-kind' }, '回复'),
              h('span', { className: 'awv-args' }, item.tokens ? item.tokens + ' tokens · ' + clockOf(item.time) : clockOf(item.time)),
            ),
            h('div', { className: 'awv-text' }, item.text),
          ),
        )
      }
      const running = !item.res
      const failed = item.res && !item.res.ok
      return shell(
        failed ? 'k-error' : item.hint === 'dispatch' ? 'k-dispatch' : 'k-call',
        h(
          React.Fragment,
          null,
          h(
            'div',
            { className: 'awv-top' },
            h('span', { className: 'awv-kind' }, item.hint === 'dispatch' ? '派发' : '调用'),
            h('span', { className: 'awv-tool' }, item.name),
            item.args ? h('span', { className: 'awv-args' }, item.args) : null,
            h('span', { className: 'awv-state' + (failed ? ' is-bad' : item.res ? ' is-ok' : '') }, running ? '运行中' : failed ? '失败' : durationOf(item)),
          ),
          item.res && item.res.text
            ? h('div', { className: 'awv-text is-short awv-res' + (failed ? ' is-bad' : '') }, failed && item.res.err ? item.res.err + ' — ' + item.res.text : item.res.text)
            : null,
        ),
      )
    }

    // ----------------------------------------------------------------- panel

    function Panel({ rootId, onClose }) {
      const [tab, setTab] = useState('map')
      const [focusSeq, setFocusSeq] = useState(0)
      const feedRef = useRef(null)
      const mapUrl = '/agent-workflow/map?root=' + encodeURIComponent(rootId)
      const snapshotUrl = '/agent-workflow/snapshot?root=' + encodeURIComponent(rootId)
      const mapState = useJson(mapUrl, tab === 'map')
      const snapshotState = useJson(snapshotUrl, tab !== 'map')
      const map = mapState.data
      const model = (map && map.model) || {}
      const nodes = (map && map.nodes) || []
      const running = nodes.some((node) => node.id === (map && map.live))
      const error = tab === 'map' ? mapState.error : snapshotState.error
      const title = '会话 ' + shortId(rootId)

      useEffect(() => {
        if (tab !== 'timeline' || !focusSeq) return
        const element = feedRef.current && feedRef.current.querySelector('[data-seq="' + focusSeq + '"]')
        if (element && element.scrollIntoView) element.scrollIntoView({ block: 'center' })
      }, [tab, focusSeq, snapshotState.data])

      return h(
        'div',
        { className: 'awv-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'awv-panel', role: 'dialog', 'aria-label': '工作流' },
          h(
            'div',
            { className: 'awv-head' },
            h('span', { className: 'awv-live' + (running ? ' is-run' : '') }),
            h('span', { className: 'awv-title' }, '工作流'),
            h('span', { className: 'awv-head-title' }, title),
            h(
              'div',
              { className: 'awv-tabs' },
              h('button', { className: 'awv-tab' + (tab === 'map' ? ' is-on' : ''), onClick: () => setTab('map') }, '能力图'),
              h('button', { className: 'awv-tab' + (tab === 'timeline' ? ' is-on' : ''), onClick: () => setTab('timeline') }, '时间线'),
            ),
            h('button', { className: 'awv-close', onClick: onClose, 'aria-label': '关闭' }, '×'),
          ),
          h(
            'div',
            { className: 'awv-body' },
            tab === 'map'
              ? h(MapView, {
                  map,
                  error: mapState.error,
                  onPickCall: (seq) => {
                    setFocusSeq(seq)
                    setTab('timeline')
                  },
                })
              : h(
                  'div',
                  { className: 'awv-feed', ref: feedRef },
                  ((snapshotState.data && snapshotState.data.items) || []).length
                    ? ((snapshotState.data && snapshotState.data.items) || []).map((item, index) =>
                        h(FeedRow, {
                          key: (item.seq || 0) + ':' + item.kind + ':' + index,
                          item,
                          focused: item.seq === focusSeq,
                        }),
                      )
                    : h(
                        'div',
                        { className: 'awv-empty' },
                        snapshotState.error ? '读取失败：' + snapshotState.error : '还没有事件。',
                      ),
                ),
          ),
          h(
            'div',
            { className: 'awv-foot' },
            tab === 'map'
              ? h(
                  React.Fragment,
                  null,
                  h('span', null, (model.provider ? model.provider + ' / ' : '') + (model.model || '模型未知')),
                  h('span', null, '请求 ' + (model.requests || 0)),
                  h('span', null, '工具 ' + (model.toolCalls || 0)),
                  h('span', null, model.errors ? '错误 ' + model.errors : '无错误'),
                  h('span', null, '入 ' + tokensOf(model.tokensIn) + ' / 出 ' + tokensOf(model.tokensOut) + ' tokens'),
                  h('span', { style: { marginLeft: 'auto' } }, '滚轮缩放 · 拖动平移'),
                )
              : h('span', null, '最近 ' + (((snapshotState.data && snapshotState.data.items) || []).length) + ' 条'),
            error ? h('span', { className: 'awv-foot-err' }, error) : null,
          ),
        ),
      )
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return h(
            'div',
            { className: 'awv-root' },
            h('style', null, CSS),
            h('div', { className: 'awv-panel' }, h('div', { className: 'awv-empty' }, '面板渲染出错：' + String((this.state.error && this.state.error.message) || this.state.error))),
          )
        }
        return this.props.children
      }
    }

    function Overlay() {
      const state = useStoreState()
      if (!state.open || !state.sessionId) return null
      return h(Boundary, null, h(Panel, { rootId: state.sessionId, onClose: () => update({ open: false }) }))
    }

    function Launcher(props) {
      const state = useStoreState()
      const sessionId = props && props.sessionId
      const isOpen = state.open && state.sessionId === sessionId
      useEffect(() => {
        if (state.open && sessionId && state.sessionId !== sessionId) update({ sessionId })
      }, [sessionId])
      return h(
        'button',
        {
          className: 'awv-launch' + (isOpen ? ' is-open' : ''),
          onClick: () => (isOpen ? update({ open: false }) : update({ open: true, sessionId })),
          title: '工作流：这个模型在调什么、从哪里拿东西',
          'aria-pressed': isOpen,
        },
        h('span', { className: 'awv-launch-glyph' }, '◆'),
        h('span', null, '工作流'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            { name: 'conversation.input.right', id: 'agent-workflow-viewer', order: 40, label: () => '工作流' },
            Launcher,
          ),
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'agent-workflow-viewer-overlay', order: 400 }, Overlay),
        )
      },
    }
  },
})
