// dsh-tool-pocket: keep a token-heavy tool group installed but out of the
// model-facing tool schema. Calling the pocket tool unlocks the group's tools
// for the following step; the turn's end locks them again.
//
// Safety rule: the restriction is only mounted while the meta tool that lifts
// it is registered and reachable. Any failure leaves the group visible.

import { createHash } from 'node:crypto'

export const inject = ['tools']

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : String(value) }],
}

const DEFAULT_PREFIXES = ['ego_']
const MAX_LINES = 60

function warn(message) {
  try { console.warn('[dsh-tool-pocket] ' + message) } catch { /* ignore */ }
}

function clip(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

export function apply(ctx, config = {}) {
  const prefixes = (Array.isArray(config?.prefixes) ? config.prefixes : DEFAULT_PREFIXES)
    .filter(prefix => typeof prefix === 'string' && prefix.length > 0)
  if (prefixes.length === 0) return
  const metaName = typeof config?.metaTool === 'string' && config.metaTool ? config.metaTool : 'pocket'
  const disarmOnTurnEnd = config?.turnEnd !== false
  const holdByDefault = config?.hold === true
  const hint = typeof config?.hint === 'string' ? config.hint.trim().replace(/[。．.]$/, '') : ''
  const autoOpen = config?.autoOpen !== false
  const openWords = (Array.isArray(config?.openWords)
    ? config.openWords
    : ['网页', '浏览器', '打开链接', '打开网站', '截图', '表单', '登录后', '抓接口', '抓包', '下载文件', '页面'])
    .filter(word => typeof word === 'string' && word.length > 0)
  const closeWords = (Array.isArray(config?.closeWords)
    ? config.closeWords
    : ['收起工具', '收起来', '关掉工具', '锁上工具', '收起口袋', '关掉口袋'])
    .filter(word => typeof word === 'string' && word.length > 0)

  const gates = new Map()
  const autoLog = []
  let closed = false
  let metaReady = false
  let metaDefinition

  // Small ring buffer surfaced by the state route for diagnosing the keyword
  // router (which message sources it saw, what it matched, what it did).
  function autoNote(entry) {
    autoLog.push({ at: Date.now(), ...entry })
    if (autoLog.length > 12) autoLog.shift()
  }

  const matches = name => prefixes.some(prefix => name.startsWith(prefix))

  function dispose(effect) {
    try { effect?.(); return true } catch (err) { warn('dispose failed: ' + (err?.message ?? err)); return false }
  }

  function dropRestriction(gate) {
    const effect = gate.restrictDisposer
    gate.restrictDisposer = undefined
    gate.filterKey = ''
    gate.degraded = false
    dispose(effect)
  }

  function destroy(gate) {
    gate.dead = true
    gates.delete(gate.agent.id)
    dropRestriction(gate)
    gate.catalog.clear()
    gate.released.clear()
  }

  function definition() {
    metaDefinition ??= {
      name: metaName,
      description:
        `Open the deferred tool group${hint ? ' — ' + hint : ''}. ` +
        'Call with no arguments to unlock every deferred tool, or pass exact names to unlock a subset; unlocked ' +
        'tools are callable from the next model step. By default they lock again when this turn ends — pass ' +
        'hold:true to keep them open until lock:true closes the pocket. lock:true closes it now. Returns the ' +
        'deferred tool list.',
      parameters: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact deferred tool names to unlock; omit to unlock all of them.',
        },
        hold: {
          type: 'boolean',
          description: 'Keep the unlocked tools open across turns until lock:true; omit to keep the current mode.',
        },
        lock: {
          type: 'boolean',
          description: 'Close the pocket now: re-lock everything and leave hold mode.',
        },
      },
      output: TEXT_OUTPUT,
      isConcurrencySafe: () => false,
      execute: (args, exec) => unlock(exec?.agent, args),
    }
    return metaDefinition
  }

  function registerMeta() {
    try {
      const effect = ctx.tools.register(definition(), {
        when: context => {
          const gate = context?.agent ? gates.get(context.agent.id) : undefined
          return Boolean(gate && !gate.dead && gate.catalog.size > 0)
        },
      })
      if (typeof effect !== 'function') throw new Error('register() returned no disposer')
      metaReady = true
      return effect
    } catch (err) {
      warn('meta tool registration failed: ' + (err?.message ?? err))
      metaReady = false
      return undefined
    }
  }

  function gateForAgent(agent) {
    if (closed || agent?.id === undefined) return undefined
    const gate = gateFor(agent)
    if (!gate) return undefined
    if (gate.catalog.size === 0 || !gate.restrictDisposer) refresh(gate)
    return gate
  }

  // Recompute the catalog and make the mounted restriction match `released`.
  // Returns true when the group is either hidden behind a working pocket or
  // has nothing to hide.
  function refresh(gate) {
    if (closed || gate.dead || gate.busy) return false
    gate.busy = true
    try {
      const view = gate.tools.view(gate.agent)
      if (!view || typeof view.restrictableNames?.has !== 'function' || !metaReady) {
        dropRestriction(gate)
        return false
      }
      const catalog = new Map()
      const globalView = gate.tools.view(undefined)
      for (const name of view.restrictableNames) {
        if (name === metaName || !matches(name)) continue
        const previous = gate.catalog.get(name)
        const icon = view.visible.get(name) ?? globalView?.visible?.get(name) ?? previous?.definition
        catalog.set(name, {
          definition: icon,
          description: clip(icon?.description, 96) || previous?.description || '',
        })
      }
      gate.catalog = catalog
      for (const name of [...gate.released]) if (!catalog.has(name)) gate.released.delete(name)

      if (catalog.size === 0) {
        dropRestriction(gate)
        return true
      }

      const deny = [...catalog.keys()].filter(name => !gate.released.has(name)).sort()
      const key = deny.join('\n')
      if (key === gate.filterKey) return true
      if (deny.length === 0) {
        dropRestriction(gate)
        return true
      }
      let effect
      try {
        effect = gate.tools.restrict({ deny })
      } catch (err) {
        warn('restriction failed, keeping current visibility: ' + (err?.message ?? err))
        return false
      }
      if (typeof effect !== 'function') {
        dispose(effect)
        return false
      }
      const previous = gate.restrictDisposer
      gate.restrictDisposer = effect
      gate.filterKey = key
      // Mount the replacement before dropping the previous restriction so the
      // group never becomes briefly visible.
      dispose(previous)
      // A restriction that mounts but does not actually hide a name would make
      // the pocket look healthy while the tokens are still being spent. Detect
      // it here and surface it in the panel and the snapshot.
      const after = gate.tools.view(gate.agent)
      const leaked = after ? deny.filter(name => after.visible.has(name)) : []
      gate.degraded = leaked.length > 0
      if (leaked.length > 0) {
        warn('restriction is not effective for ' + leaked.length + ' tool(s): ' + leaked.slice(0, 5).join(', '))
      }
      return true
    } finally {
      gate.busy = false
    }
  }

  function unlock(agent, args) {
    if (closed) return 'The pocket is not available; nothing was unlocked.'
    const gate = gateForAgent(agent)
    if (!gate || gate.dead) return 'The pocket is not available in this agent; nothing was unlocked.'
    refresh(gate)
    if (args?.lock === true) {
      gate.released.clear()
      gate.hold = false
      refresh(gate)
      return `Closed: all ${gate.catalog.size} deferred tools are locked again and hold mode is off.`
    }
    const requested = Array.isArray(args?.names) ? args.names.filter(name => typeof name === 'string') : []
    const names = [...new Set(requested)]
    const catalogue = [...gate.catalog.keys()].sort()
    const unknown = names.filter(name => !gate.catalog.has(name))
    const targets = names.length > 0 ? names.filter(name => gate.catalog.has(name)) : catalogue
    if (targets.length === 0) {
      if (names.length > 0) return 'Unknown deferred tool names: ' + names.slice(0, 10).join(', ') + '; nothing was unlocked.'
      return 'The pocket is empty; there is nothing to unlock.'
    }
    if (typeof args?.hold === 'boolean') gate.hold = args.hold

    const before = new Set(gate.released)
    for (const name of targets) gate.released.add(name)
    const applied = refresh(gate)
    const visible = gate.tools.view(gate.agent)?.visible
    const loaded = targets.filter(name => applied && visible?.has(name))
    for (const name of targets) {
      if (!loaded.includes(name) && !before.has(name)) gate.released.delete(name)
    }
    if (!applied && [...gate.released].some(name => !before.has(name))) {
      for (const name of targets) if (!before.has(name)) gate.released.delete(name)
      refresh(gate)
    }

    const lines = loaded.slice(0, MAX_LINES).map(name => '- ' + name)
    autoNote({
      session: String(gate.agent.id),
      result: 'tool-unlock',
      targets: targets.length,
      loaded: loaded.length,
      applied,
      released: gate.released.size,
      catalog: gate.catalog.size,
      visible: visible ? visible.size : -1,
      busy: gate.busy,
      closed,
    })
    const hiddenNow = gate.catalog.size - gate.released.size
    const parts = [
      gate.hold
        ? `Unlocked ${loaded.length}/${gate.catalog.size} deferred tools; they stay open until you call { lock: true }.`
        : `Unlocked ${loaded.length}/${gate.catalog.size} deferred tools for the next step; they lock again when this turn ends.`,
    ]
    if (lines.length > 0) parts.push(lines.join('\n'))
    if (loaded.length > lines.length) parts.push(`… and ${loaded.length - lines.length} more.`)
    if (unknown.length > 0) parts.push('Unknown names ignored: ' + unknown.slice(0, 10).join(', '))
    if (hiddenNow > 0) parts.push(`${hiddenNow} deferred tools stay locked.`)
    return parts.join('\n')
  }

  function messageText(messages) {
    let text = ''
    for (const message of messages ?? []) {
      // DSH injects per-turn runtime context as user-shaped messages too; only
      // real task input (user or delegated agent) may trigger an automatic open.
      const source = message?.source?.kind
      if (source === 'plugin') continue
      if (source === 'runtime-context') continue
      const content = message?.content
      if (typeof content === 'string') {
        text += '\n' + content
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block === 'string') text += '\n' + block
          else if (block && block.type === 'text' && typeof block.text === 'string') text += '\n' + block.text
        }
      }
    }
    return text.trim()
  }

  // Optional keyword router: when the user's own message mentions browser work,
  // open the group for this turn before the tools are resolved, so the model
  // does not need a discovery round-trip. Explicit close words win.
  function maybeAutoOpen(payload, messages) {
    if (!autoOpen) return
    let gate = gates.get(payload?.agent?.id)
    if (!gate && payload?.agent) {
      // A message can enter the inbox before the created listener runs.
      gate = gateFor(payload.agent)
      if (gate) refresh(gate)
    }
    const text = messageText(messages).toLowerCase()
    const session = String(payload?.agent?.id ?? '?')
    const sources = (messages ?? [])
      .map(message => String(message?.source?.kind ?? '?') + ':' + String(message?.source?.plugin ?? message?.source?.name ?? ''))
      .slice(0, 6)
    if (!gate) {
      autoNote({ session, sources, result: 'no-gate', chars: text.length })
      return
    }
    if (!text) {
      autoNote({ session, sources, result: 'empty' })
      return
    }
    const closeWord = closeWords.find(word => text.includes(word.toLowerCase()))
    if (closeWord) {
      if (gate.released.size > 0) {
        gate.released.clear()
        refresh(gate)
      }
      autoNote({ session, sources, result: 'close', word: closeWord, released: gate.released.size })
      return
    }
    if (gate.hold) {
      autoNote({ session, sources, result: 'hold', released: gate.released.size })
      return
    }
    const openWord = openWords.find(word => text.includes(word.toLowerCase()))
    if (!openWord) {
      autoNote({ session, sources, result: 'no-match', released: gate.released.size })
      return
    }
    refresh(gate)
    if (gate.catalog.size === 0) {
      autoNote({ session, sources, result: 'empty-pocket', word: openWord })
      return
    }
    let changed = false
    for (const name of gate.catalog.keys()) {
      if (!gate.released.has(name)) {
        gate.released.add(name)
        changed = true
      }
    }
    if (changed) refresh(gate)
    autoNote({ session, sources, result: 'open', word: openWord, released: gate.released.size, catalog: gate.catalog.size })
  }

  const onPreStep = async (payload, next) => {
    const decision = await next()
    try {
      if (decision && decision.kind === 'enter' && Array.isArray(decision.messages)) {
        maybeAutoOpen(payload, decision.messages)
      }
    } catch (err) {
      warn('auto-open failed: ' + (err?.message ?? err))
    }
    return decision
  }

  // The inbox is the earliest point a turn's input is visible: opening here
  // happens before the step resolves its tool set, so a keyword turn sees the
  // tools in its very first model request.
  const onInbox = payload => {
    try {
      maybeAutoOpen(payload, payload?.message ? [payload.message] : [])
    } catch (err) {
      warn('auto-open failed: ' + (err?.message ?? err))
    }
  }

  function gateFor(agent) {
    if (closed || agent?.id === undefined) return undefined
    const previous = gates.get(agent.id)
    if (previous?.agent === agent) return previous
    if (previous) destroy(previous)
    const tools = agent.ctx?.tools
    if (typeof tools?.register !== 'function' || typeof tools?.restrict !== 'function' || typeof tools?.view !== 'function') return undefined
    const gate = {
      agent,
      tools,
      catalog: new Map(),
      released: new Set(),
      restrictDisposer: undefined,
      filterKey: '',
      busy: false,
      dead: false,
      degraded: false,
      hold: holdByDefault,
    }
    gates.set(agent.id, gate)
    return gate
  }

  function syncLiveAgents() {
    if (closed) return
    const agents = ctx.get('agents')
    if (!agents || typeof agents.list !== 'function') return
    let live = []
    try { live = agents.list() } catch (err) { warn('list agents failed: ' + (err?.message ?? err)); return }
    for (const agent of live) {
      const gate = gateFor(agent)
      if (!gate) continue
      try { refresh(gate) } catch (err) { warn('refresh failed: ' + (err?.message ?? err)) }
    }
  }

  const onCreated = payload => {
    const gate = gateFor(payload?.agent)
    if (gate) refresh(gate)
  }
  const onChange = () => { syncLiveAgents() }
  const onTurnStopping = payload => {
    if (!disarmOnTurnEnd) return
    const gate = gates.get(payload?.agent?.id)
    if (!gate || gate.agent !== payload.agent) return
    if (gate.hold) return
    gate.released.clear()
    refresh(gate)
  }
  const onDisposed = payload => {
    const gate = gates.get(payload?.agent?.id)
    if (gate && gate.agent === payload.agent) destroy(gate)
  }

  ctx.on('agent/created', onCreated)
  ctx.on('tools/change', onChange)
  ctx.on('agent/inbox/inserted', onInbox)
  ctx.on('agent/pre-step', onPreStep)
  ctx.on('agent/turn-stopping', onTurnStopping)
  ctx.on('agent/disposed', onDisposed)

  // The meta tool is global to the plugin, not registered inside each agent
  // scope: a scoped registration lives on the agent context and survives a
  // plugin reload, which would leave a stale meta tool shadowing the new one.
  const metaEffect = registerMeta()
  if (metaEffect) ctx.effect(() => metaEffect)
  ctx.effect(() => () => {
    for (const gate of [...gates.values()]) destroy(gate)
  })

  syncLiveAgents()

  function snapshot(sessionId) {
    const live = [...gates.values()].filter(gate => !gate.dead && gate.catalog.size > 0)
    const selected = sessionId === null || sessionId === undefined
      ? live
      : live.filter(gate => String(gate.agent.id) === sessionId)
    const merged = new Map()
    for (const gate of selected) {
      for (const [name, entry] of gate.catalog) {
        const record = merged.get(name) ?? { name, description: clip(entry?.description, 160), released: false }
        if (!record.description && entry?.description) record.description = clip(entry.description, 160)
        if (gate.released.has(name)) record.released = true
        merged.set(name, record)
      }
    }
    const tools = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
    return {
      metaTool: metaName,
      session: sessionId ?? null,
      sessions: live.length,
      total: tools.length,
      released: tools.filter(tool => tool.released).length,
      hold: selected.some(gate => gate.hold),
      degraded: selected.some(gate => gate.degraded),
      autoLog: autoLog.slice(-10),
      tools: tools.map(tool => ({ name: tool.name, description: tool.description, locked: !tool.released })),
    }
  }

  // The shared connection service fences plugin routes with the page's cookie
  // trust. A same-origin browser fetch is marked by Chromium and cannot be
  // forged by a cross-site page, so it wins over the fence: the panel itself
  // must keep working even when the cookie is not accepted on a route.
  function sameOrigin(req) {
    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'same-origin') return true
    const host = String(req.headers.host || '').toLowerCase()
    if (!host) return false
    try {
      const url = new URL(String(req.headers.origin || req.headers.referer || ''))
      return url.host.toLowerCase() === host
    } catch {
      return false
    }
  }

  function trustCode(req) {
    try {
      const connection = ctx.get('connection')
      if (!connection || typeof connection.requestRejection !== 'function') return 0
      const code = connection.requestRejection(req) || 0
      if (code && sameOrigin(req)) return 0
      return code
    } catch {
      return 0
    }
  }

  function stateHandler(req, res) {
    try {
      const rejected = trustCode(req)
      if (rejected) {
        res.writeHead(rejected, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end()
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        res.end()
        return
      }
      let session = null
      try {
        const url = new URL(String(req.url || '/'), 'http://127.0.0.1')
        session = url.searchParams.get('session') || null
      } catch {
        session = null
      }
      const body = JSON.stringify(snapshot(session))
      const tag = '"' + createHash('sha1').update(body).digest('base64url').slice(0, 27) + '"'
      if (req.headers['if-none-match'] === tag) {
        res.writeHead(304, { ETag: tag, 'Cache-Control': 'no-cache' })
        res.end()
        return
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ETag: tag,
        'Content-Length': Buffer.byteLength(body),
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String(err?.message ?? err) }))
    }
  }

  // Manual close from the panel: clear every release (and hold mode) for the
  // requested session, or for every live gate when no session is supplied.
  function lockNow(sessionId) {
    let locked = 0
    for (const gate of gates.values()) {
      if (gate.dead) continue
      if (sessionId && String(gate.agent.id) !== sessionId) continue
      gate.released.clear()
      gate.hold = false
      refresh(gate)
      locked += 1
      autoNote({ session: String(gate.agent.id), result: 'close-panel', released: gate.released.size })
    }
    return locked
  }

  function lockHandler(req, res) {
    try {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' })
        res.end()
        return
      }
      const rejected = trustCode(req)
      if (rejected) {
        res.writeHead(rejected, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end()
        return
      }
      // A custom header makes the call non-simple: a cross-site page would need
      // a CORS preflight this server never approves, so a form cannot close it.
      if (String(req.headers['x-tool-pocket'] || '') !== 'lock' || !sameOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('forbidden')
        return
      }
      let session = null
      try {
        session = new URL(String(req.url || '/'), 'http://127.0.0.1').searchParams.get('session') || null
      } catch {
        session = null
      }
      const locked = lockNow(session)
      const body = JSON.stringify({ ok: true, locked })
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body),
      })
      res.end(body)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
    }
  }

  const webServer = ctx.get('webServer')
  if (webServer && typeof webServer.register === 'function') {
    ctx.effect(() => webServer.register({ kind: 'exact', path: '/tool-pocket/state', handler: stateHandler }))
    ctx.effect(() => webServer.register({ kind: 'exact', path: '/tool-pocket/lock', handler: lockHandler }))
  }

  return () => {
    if (closed) return
    closed = true
    ctx.off('agent/created', onCreated)
    ctx.off('tools/change', onChange)
    ctx.off('agent/inbox/inserted', onInbox)
    ctx.off('agent/pre-step', onPreStep)
    ctx.off('agent/turn-stopping', onTurnStopping)
    ctx.off('agent/disposed', onDisposed)
    for (const gate of [...gates.values()]) destroy(gate)
  }
}
