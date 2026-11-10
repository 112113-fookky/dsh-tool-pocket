/* dsh-tool-pocket client bundle — handwritten, no bundler.
 *
 * Load protocol: window.__ModuleLoader__.load({ id, factory }); id must equal
 * the package name. The factory is lazy CJS: module.exports only, and React
 * must be used through React.createElement.
 *
 * Data comes from the same-origin GET /tool-pocket/state route the host half
 * registers — no host RPC needed.
 */
window.__ModuleLoader__.load({
  id: 'dsh-tool-pocket',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var POLL_MS = 5000
    var ROUTE = '/tool-pocket/state'

    var CSS = [
      '.tp-root{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;font-size:13px;line-height:1.45;color:var(--dsw-alias-label-primary)}',
      '.tp-root *{box-sizing:border-box}',
      '.tp-pill{pointer-events:auto;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px 0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#c8cede);background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 6px 20px rgba(18,26,52,.16);cursor:pointer;font:inherit;font-size:12.5px;font-weight:600;letter-spacing:.2px;color:inherit;transition:transform .16s ease,box-shadow .16s ease}',
      '.tp-pill:hover{transform:translateY(-1px);box-shadow:0 9px 24px rgba(18,26,52,.2)}',
      '.tp-pill:active{transform:translateY(0)}',
      '.tp-pill .tp-label{font-variant-numeric:tabular-nums}',
      '.tp-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary,#9aa3b8);flex:0 0 auto}',
      '.tp-dot.on{background:var(--dsw-alias-state-success-primary,#2f9e6b);box-shadow:0 0 0 3px rgba(47,158,107,.18)}',
      '.tp-dot.bad{background:var(--dsw-alias-state-error-primary,#d6443c);box-shadow:0 0 0 3px rgba(214,68,60,.16)}',
      '.tp-warn{padding:8px 13px 0;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-state-error-primary,#d6443c)}',
      '.tp-panel{pointer-events:auto;width:290px;max-width:calc(100vw - 36px);border-radius:14px;border:1px solid var(--dsw-alias-border-l1,#dfe3ee);background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 16px 40px rgba(18,26,52,.22);overflow:hidden;animation:tp-rise .18s ease-out}',
      '.tp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 13px 9px;border-bottom:1px solid var(--dsw-alias-border-l1,#eceff6)}',
      '.tp-title{font-size:13px;font-weight:700;letter-spacing:.2px}',
      '.tp-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary,#7b839a);font-variant-numeric:tabular-nums}',
      '.tp-hint{padding:8px 13px 0;font-size:11.5px;color:var(--dsw-alias-label-secondary,#7b839a);line-height:1.5}',
      '.tp-list{max-height:260px;overflow:auto;padding:6px 7px 8px;margin-top:4px}',
      '.tp-row{display:flex;align-items:flex-start;gap:8px;padding:6px 6px;border-radius:8px}',
      '.tp-row.open{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b6ef6) 9%,transparent)}',
      '.tp-name{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto}',
      '.tp-desc{font-size:11px;color:var(--dsw-alias-label-secondary,#7b839a);margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}',
      '.tp-glyph{width:14px;height:14px;flex:0 0 auto;margin-top:2px;color:var(--dsw-alias-state-idle-primary,#9aa3b8)}',
      '.tp-row.open .tp-glyph{color:var(--dsw-alias-state-success-primary,#2f9e6b)}',
      '.tp-empty{padding:10px 8px 12px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#7b839a)}',
      '.tp-foot{display:flex;justify-content:flex-end;gap:8px;padding:8px 12px 11px;border-top:1px solid var(--dsw-alias-border-l1,#eceff6)}',
      '.tp-btn{pointer-events:auto;height:26px;padding:0 13px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#c8cede);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}',
      '.tp-btn:hover{border-color:var(--dsw-alias-brand-primary,#3b6ef6);color:var(--dsw-alias-brand-primary,#3b6ef6)}',
      '.tp-btn[disabled]{opacity:.55;cursor:default}',
      '@keyframes tp-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
    ].join('\n')

    function PouchGlyph(props) {
      var on = props && props.on
      return React.createElement('svg', {
        width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
        stroke: on ? 'var(--dsw-alias-brand-primary,#3b6ef6)' : 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        React.createElement('path', { d: 'M4 9.5h16l-1.4 8.6a2.4 2.4 0 0 1-2.4 2H7.8a2.4 2.4 0 0 1-2.4-2L4 9.5Z' }),
        React.createElement('path', { d: 'M8.4 9.5V7.8a3.6 3.6 0 0 1 7.2 0v1.7' }))
    }

    function LockGlyph(props) {
      var open = props && props.open
      return React.createElement('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        React.createElement('rect', { x: 5, y: 11, width: 14, height: 9, rx: 2.2 }),
        open
          ? React.createElement('path', { d: 'M8.5 11V7.6a3.5 3.5 0 0 1 6.6-1.6' })
          : React.createElement('path', { d: 'M8.5 11V7.6a3.5 3.5 0 0 1 7 0V11' }))
    }

    function useStatus(session, refreshKey) {
      var snapPair = React.useState(null)
      var setSnap = snapPair[1]
      var failPair = React.useState(false)
      var setFailed = failPair[1]
      React.useEffect(function () {
        var alive = true
        var timer = null
        var seq = 0
        var target = session ? ROUTE + '?session=' + encodeURIComponent(session) : ROUTE
        function tick() {
          if (document.hidden) return
          var mine = ++seq
          fetch(target, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
            // The host answers 304 with an ETag; keep the snapshot we already have.
            if (r.status === 304) return null
            if (!r.ok) throw new Error('HTTP ' + r.status)
            return r.json()
          }).then(function (value) {
            if (!alive || mine !== seq) return
            if (value !== null) { setSnap(value); setFailed(false) }
          }, function () {
            if (!alive || mine !== seq) return
            setFailed(true)
          })
        }
        function start() { if (timer === null) timer = setInterval(tick, POLL_MS) }
        function stop() { if (timer !== null) { clearInterval(timer); timer = null } }
        function onVisibility() {
          if (document.hidden) stop()
          else { tick(); start() }
        }
        tick()
        if (!document.hidden) start()
        document.addEventListener('visibilitychange', onVisibility)
        return function () {
          alive = false
          stop()
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [session, refreshKey])
      return { snap: snapPair[0], failed: failPair[0] }
    }

    function Pocket(props) {
      var session = null
      try {
        // Root-scoped overlays get the standard session hooks; the active
        // Session id keeps the panel from mixing several agents' counters.
        if (props && typeof props.useSessions === 'function') {
          var sessionState = props.useSessions(function (state) { return state })
          session = (sessionState && sessionState.current) || null
        }
      } catch (err) {
        session = null
      }
      var openPair = React.useState(false)
      var open = openPair[0]
      var setOpen = openPair[1]
      var refreshPair = React.useState(0)
      var refreshKey = refreshPair[0]
      var setRefreshKey = refreshPair[1]
      var busyPair = React.useState(false)
      var closing = busyPair[0]
      var setClosing = busyPair[1]
      var status = useStatus(session, refreshKey)
      var snap = status.snap
      var failed = status.failed

      function closePocket() {
        if (closing || !session) return
        setClosing(true)
        fetch('/tool-pocket/lock?session=' + encodeURIComponent(session), {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'x-tool-pocket': 'lock' },
        }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status)
          return r.json()
        }).then(function () {
          setRefreshKey(function (value) { return value + 1 })
        }).catch(function () { /* 留着按钮，阿爹可以再点一次 */ })
          .then(function () { setClosing(false) })
      }

      React.useEffect(function () {
        if (!open) return
        function onKey(event) { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('keydown', onKey)
        return function () { document.removeEventListener('keydown', onKey) }
      }, [open])

      var total = snap && typeof snap.total === 'number' ? snap.total : 0
      var released = snap && typeof snap.released === 'number' ? snap.released : 0
      var offline = failed && !snap
      if (!total && !offline) return null

      var tools = snap && Array.isArray(snap.tools) ? snap.tools : []
      var live = released > 0
      var hold = Boolean(snap && snap.hold)
      var degraded = Boolean(snap && snap.degraded)

      var rows = tools.map(function (tool) {
        var isOpen = tool && tool.locked === false
        return React.createElement('div', {
          className: 'tp-row' + (isOpen ? ' open' : ''),
          key: tool.name,
          title: tool.description || tool.name,
        },
          React.createElement('span', { className: 'tp-glyph' }, React.createElement(LockGlyph, { open: isOpen })),
          React.createElement('div', { style: { flex: '1 1 auto', minWidth: 0 } },
            React.createElement('div', { className: 'tp-name' }, tool.name),
            tool.description ? React.createElement('div', { className: 'tp-desc' }, tool.description) : null))
      })

      var meta = offline
        ? '连不上'
        : degraded
          ? '锁没挂上'
          : live
            ? released + ' / ' + total + ' 件' + (hold ? ' · 保持' : '已放行')
            : total + ' 件全锁着'

      var hint = offline
        ? '拿不到口袋的状态。可能是同源请求被挡住了，跟阿爹说一声。'
        : live
          ? (hold ? '会一直开着，等我说收才收。' : '这一轮用完我就锁回去。')
          : '要用的时候跟我说一声，我开给你看。'

      var warn = offline
        ? React.createElement('div', { className: 'tp-warn' }, '状态接口没有回应，面板先断开。')
        : degraded
          ? React.createElement('div', { className: 'tp-warn' }, '限制没生效，这些工具其实还摊在外面——也就是说 token 还在花。')
          : null

      var extra = snap && snap.sessions > 1
        ? React.createElement('div', { className: 'tp-hint' }, '本机还有 ' + (snap.sessions - 1) + ' 个会话也放着口袋。')
        : null

      var label = offline
        ? '口袋 · 连不上'
        : degraded
          ? '口袋 · 漏了'
          : live
            ? (hold ? '口袋 · 开着' : '口袋 · 已开 ' + released)
            : '口袋 · ' + total

      return React.createElement('div', { className: 'tp-root' },
        open
          ? React.createElement('div', { className: 'tp-panel', role: 'dialog', 'aria-label': '工具口袋' },
            React.createElement('div', { className: 'tp-head' },
              React.createElement('span', { className: 'tp-title' }, '工具口袋'),
              React.createElement('span', { className: 'tp-meta' }, meta)),
            React.createElement('div', { className: 'tp-hint' }, hint),
            warn,
            extra,
            rows.length > 0
              ? React.createElement('div', { className: 'tp-list' }, rows)
              : React.createElement('div', { className: 'tp-empty' }, offline ? '等它连回来。' : '口袋是空的。'),
            session && (live || hold)
              ? React.createElement('div', { className: 'tp-foot' },
                React.createElement('button', {
                  type: 'button',
                  className: 'tp-btn',
                  disabled: closing,
                  onClick: closePocket,
                }, closing ? '收起中…' : '收起来'))
              : null)
          : null,
        React.createElement('button', {
          type: 'button',
          className: 'tp-pill',
          'aria-expanded': open,
          'aria-label': '工具口袋：' + label,
          title: '工具口袋',
          onClick: function () { setOpen(!open) },
        },
          React.createElement(PouchGlyph, { on: live }),
          React.createElement('span', { className: 'tp-label' }, label),
          React.createElement('span', { className: 'tp-dot' + (offline || degraded ? ' bad' : live ? ' on' : '') })))
    }

    function apply(ctx) {
      ctx.effect(function () {
        var style = document.createElement('style')
        style.setAttribute('data-dsh-tool-pocket', '')
        style.textContent = CSS
        document.head.appendChild(style)
        return function () { style.remove() }
      })

      var slots = ctx.slots
      slots.inject('shell.overlay', function () {
        return slots.register({ name: 'shell.overlay', id: 'tool-pocket', order: 80, label: '工具口袋' }, Pocket)
      })
    }

    module.exports = { name: 'dsh-tool-pocket', inject: ['slots'], apply: apply }
    return module.exports
  },
})
