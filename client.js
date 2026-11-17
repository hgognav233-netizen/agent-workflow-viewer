window.__ModuleLoader__.load({
  id: 'agent-workflow-viewer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React
    // Read the language on every call so the labels follow a change in Harness settings.
    const t = (cn, en) => (document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('zh') ? cn : en
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

    // Everything inside the panel is the plugin's canvas page; this file only
    // places it. The page follows Harness's language and colours by itself.
    const frameStyle = { flex: 1, width: '100%', minHeight: 0, border: 0, display: 'block', background: 'transparent' }
    const fromCanvas = (event, frame) => event.origin === location.origin && event.source === frame.current?.contentWindow
      && event.data?.source === 'agent-workflow-viewer'

    function Panel({ root, close }) {
      const frame = useRef(null)
      const [full, setFull] = useState(false)
      useEffect(() => {
        const listener = (event) => {
          if (!fromCanvas(event, frame)) return
          if (event.data.action === 'close') close()
          if (event.data.action === 'fill') setFull(true)
          if (event.data.action === 'restore') setFull(false)
        }
        window.addEventListener('message', listener)
        return () => window.removeEventListener('message', listener)
      }, [close])
      useEffect(() => {
        const key = (event) => { if (event.key === 'Escape') close() }
        window.addEventListener('keydown', key)
        return () => window.removeEventListener('keydown', key)
      }, [close])
      return h('section', {
        role: 'dialog', 'aria-label': t('工作流', 'Workflow'),
        style: {
          position: 'fixed', zIndex: 90, inset: full ? '8px' : '48px 16px 64px auto',
          width: full ? 'auto' : 'min(980px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 16, border: '1px solid var(--dsw-alias-border-l2, #e2e5e9)',
          background: 'var(--dsw-alias-bg-layer-1, #fff)', boxShadow: '0 20px 70px #0000004d',
        },
      }, h('iframe', {
        ref: frame, title: t('工作流', 'Workflow'), style: frameStyle,
        src: '/agent-workflow/canvas?' + new URLSearchParams({ focus: root, embed: 'panel' }),
        onLoad: () => frame.current?.contentWindow?.focus(),
      }))
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
        type: 'button', 'aria-pressed': open, disabled: !sessionId, ref,
        style: {
          border: '1px solid currentColor', background: 'transparent', borderRadius: 8, padding: '2px 8px', font: 'inherit', fontSize: 12,
          color: open ? 'var(--dsw-alias-brand-primary, #2f62d8)' : 'inherit', cursor: sessionId ? 'pointer' : 'default', whiteSpace: 'nowrap',
        },
        onClick: () => {
          launcher = ref.current
          if (open) close()
          else update({ open: true, session: sessionId })
        },
      }, '◇ ', t('工作流', 'Workflow'))
    }

    // Sidebar icon: the same diamond as the in-conversation launcher.
    function WorkflowIcon({ size }) {
      const edge = typeof size === 'number' ? size : 18
      return h('svg', {
        width: edge, height: edge, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false',
        style: { display: 'block' },
      }, h('path', {
        d: 'M8 2.4 L13.6 8 L8 13.6 L2.4 8 Z', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinejoin: 'round',
      }))
    }

    // Application-level page: every session on one canvas. The canvas brings
    // its own header (title, status, "open in browser"), so there is no second bar here.
    function CanvasPage() {
      return h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 'var(--dsh-frame-top-clearance, 0px)' } },
        h('iframe', { title: t('工作流画布', 'Workflow canvas'), src: '/agent-workflow/canvas', style: frameStyle }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'agent-workflow-viewer', order: 40, label: () => t('工作流', 'Workflow') }, Launcher))
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'agent-workflow-viewer-overlay', order: 400 }, Overlay))
        // Application level: an icon in the left panel list plus the page it opens.
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'agent-workflow', order: 20, label: () => t('工作流', 'Workflow') }, WorkflowIcon))
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'agent-workflow' }, CanvasPage))
      },
    }
  },
})
