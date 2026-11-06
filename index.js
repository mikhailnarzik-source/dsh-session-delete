/**
 * Host half of `@local/session-delete`.
 *
 * Two routes on the authenticated `/api` channel, both reachable only by the
 * page's owner Peer:
 *
 *  - `inspect` reads a Session before anything is destroyed: its title, its
 *    Workspace, the Sessions related to it by lineage, and the project files
 *    its file-writing tool calls named.
 *  - `delete` forgets the Session completely: durable log, projection-cache
 *    row, pin and archive accounting, Workspace membership, hidden descendant
 *    Sessions, and — only when the caller asks for it — the existing project
 *    files those tool calls created or modified.
 *
 * Files inside the Workspace directory are never touched unless the user ticks
 * that option, and even then only paths named by this Session's own
 * `write`/`edit`/`apply_patch` calls that still resolve inside its working
 * directory and still exist.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'session-delete'

/** Services required before the routes can be mounted. */
export const inject = ['connection', 'sessionPersistence', 'workspaceRegistry']

const INSPECT_PATH = '/api/session-delete/inspect'
const DELETE_PATH = '/api/session-delete/delete'

/** Word the user must type in the last confirmation step. */
const CONFIRM_WORD = 'delete'

/** Durable Session ids are `session-<uuid>`; stay strict about what reaches the filesystem. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

/** Tool names whose calls name a file they create or modify. */
const FILE_WRITING_TOOLS = new Set([
  'write',
  'edit',
  'apply_patch',
  'str_replace_editor',
  'multi_edit',
  'create_file',
  'notebook_edit',
])

/** Upper bound on the file preview so one pathological log cannot flood the dialog. */
const MAX_TRACKED_FILES = 2000

/**
 * Mount both routes.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
  ctx.connection.fetch.register({
    path: INSPECT_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleInspect(ctx, request),
  })
  ctx.connection.fetch.register({
    path: DELETE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleDelete(ctx, request),
  })
}

/**
 * Answer the read-only preflight request.
 * @param ctx - owning plugin context.
 * @param request - buffered Fetch request.
 * @returns the JSON answer; `409` carries a business refusal.
 */
async function handleInspect(ctx, request) {
  const decoded = await decodeRequest(request)
  if (decoded.error !== undefined) return decoded.error
  try {
    const result = await inspectSession(ctx, decoded.sessionId)
    return json(result, result.ok ? 200 : 409)
  } catch (error) {
    console.error(`[session-delete] inspecting ${decoded.sessionId} failed:`, error)
    return json({
      ok: false,
      code: 'inspect/failed',
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
}

/**
 * Decode and answer one delete request.
 * @param ctx - owning plugin context.
 * @param request - buffered Fetch request.
 * @returns the JSON answer; `409` carries a business refusal.
 */
async function handleDelete(ctx, request) {
  const decoded = await decodeRequest(request)
  if (decoded.error !== undefined) return decoded.error
  if (decoded.payload.confirm !== CONFIRM_WORD) {
    return json({ ok: false, code: 'request/invalid', message: 'The confirm word is required.' }, 400)
  }
  const deleteFiles = decoded.payload.deleteFiles === true
  try {
    const result = await deleteSession(ctx, decoded.sessionId, { deleteFiles })
    return json(result, result.ok ? 200 : 409)
  } catch (error) {
    console.error(`[session-delete] deleting ${decoded.sessionId} failed:`, error)
    return json({
      ok: false,
      code: 'delete/failed',
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
}

/**
 * Decode the shared `{ sessionId }` envelope.
 * @param request - buffered Fetch request.
 * @returns the payload and id, or a ready error response.
 */
async function decodeRequest(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return { error: json({ ok: false, code: 'request/invalid', message: 'Malformed JSON body.' }, 400) }
  }
  const sessionId = payload !== null && typeof payload === 'object' && typeof payload.sessionId === 'string'
    ? payload.sessionId.trim()
    : ''
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { error: json({ ok: false, code: 'request/invalid', message: 'A valid sessionId is required.' }, 400) }
  }
  return { payload, sessionId }
}

/**
 * Read everything the confirmation dialog shows about one Session.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns the preflight result.
 */
async function inspectSession(ctx, sessionId) {
  const snapshot = await ctx.sessionPersistence.stat(sessionId)
  if (snapshot === undefined) {
    return { ok: false, code: 'session/not-found', message: 'The session does not exist.' }
  }
  const live = liveState(ctx, sessionId)
  const workspace = findWorkspace(ctx, sessionId)
  const cwd = sessionDirectoryOf(snapshot, workspace)
  const related = await relatedSessions(ctx, sessionId)
  const files = cwd === undefined ? [] : await collectSessionFiles(ctx, sessionId, cwd)
  const remaining = workspace === undefined
    ? 0
    : workspace.sessionIds.filter((id) => id !== sessionId).length
  return {
    ok: true,
    session: {
      sessionId,
      title: await sessionTitle(ctx, sessionId),
      cwd: cwd ?? null,
    },
    workspace: workspace === undefined ? null : {
      id: workspace.id,
      title: workspace.title,
      lastInWorkspace: remaining === 0,
    },
    live: live.live,
    running: live.running,
    related,
    files: files.map((file) => ({ relative: file.relative })),
  }
}

/**
 * Forget one Session and everything the harness stores about it.
 *
 * A live Session is refused: its writer still owns the log, so removing the
 * durable files underneath it would only make the next flush recreate them.
 *
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @param options - whether the caller also wants this Session's project files removed.
 * @returns the public result of the operation.
 */
async function deleteSession(ctx, sessionId, options) {
  const snapshot = await ctx.sessionPersistence.stat(sessionId)
  if (snapshot === undefined) {
    return { ok: false, code: 'session/not-found', message: 'The session does not exist.' }
  }

  /*
   * DSH keeps an opened Session's Agent alive for the whole Host process, so a
   * session the user has visited is always "live". Closing it first is what
   * makes the durable deletion stick: the Agent's teardown settles its turn,
   * flushes the final events and closes the write handle, after which the log
   * directory can disappear without being rewritten.
   */
  const closed = await closeLiveSession(ctx, sessionId)
  if (!closed.ok) return closed

  const refreshed = await ctx.sessionPersistence.stat(sessionId)
  if (refreshed === undefined) {
    return { ok: false, code: 'session/not-found', message: 'The session does not exist.' }
  }

  const workspace = findWorkspace(ctx, sessionId)
  const cwd = sessionDirectoryOf(refreshed, workspace)

  /* Lineage and file candidates are read before the log disappears. */
  const descendants = await descendantIds(ctx, sessionId)
  const projectFiles = options.deleteFiles && cwd !== undefined
    ? await collectSessionFiles(ctx, sessionId, cwd)
    : []

  /* Pinning and archival are mutually exclusive; both setters tolerate an absent id. */
  await ignore(() => ctx.workspaceRegistry.unpinSession(sessionId), 'unpin', sessionId)
  await ignore(() => ctx.workspaceRegistry.unarchiveSession(sessionId), 'unarchive', sessionId)

  let workspaceId = null
  let workspaceTitle = null
  let workspaceRemoved = false
  if (workspace !== undefined) {
    workspaceId = workspace.id
    workspaceTitle = workspace.title
    await workspace.detachSession(sessionId)
    if (workspace.sessionIds.length === 0) {
      workspaceRemoved = await ctx.workspaceRegistry.delete(workspace.id)
    }
  }

  /* Project files go first: a failure there must not leave the Session half-deleted. */
  const projectFileResult = await removeProjectFiles(projectFiles)

  const removedFiles = []
  const removedDirectories = []
  await removeSessionArtifacts(ctx, sessionId, refreshed, removedFiles, removedDirectories)

  const childrenRemoved = []
  let childrenSkipped = 0
  for (const childId of descendants) {
    const childClosed = await closeLiveSession(ctx, childId)
    if (!childClosed.ok) {
      childrenSkipped += 1
      continue
    }
    const childSnapshot = await ctx.sessionPersistence.stat(childId).catch(() => undefined)
    if (childSnapshot === undefined) continue
    await removeSessionArtifacts(ctx, childId, childSnapshot, removedFiles, removedDirectories)
    childrenRemoved.push(childId)
  }

  console.log(
    `[session-delete] removed ${sessionId}` +
    `${workspaceId === null ? '' : ` (workspace ${workspaceId}${workspaceRemoved ? ' removed' : ''})`}` +
    `: ${String(removedDirectories.length)} session directories, ${String(removedFiles.length)} session files, ` +
    `${String(childrenRemoved.length)} child sessions, ${String(projectFileResult.deleted)} project files`,
  )

  return {
    ok: true,
    sessionId,
    workspaceId,
    workspaceTitle,
    workspaceRemoved,
    removedFiles: removedFiles.length,
    descendantsRemoved: childrenRemoved.length,
    descendantsSkipped: childrenSkipped,
    projectFilesDeleted: projectFileResult.deleted,
    projectFilesFailed: projectFileResult.failed,
  }
}

/**
 * Remove the durable artifacts of one Session: its log directory and its
 * projection-cache row.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @param snapshot - persistence snapshot naming the log location.
 * @param removedFiles - accumulator for the report.
 * @param removedDirectories - accumulator for the report.
 */
async function removeSessionArtifacts(ctx, sessionId, snapshot, removedFiles, removedDirectories) {
  const logPath = snapshot.location !== undefined && typeof snapshot.location.path === 'string'
    ? snapshot.location.path
    : undefined
  if (logPath !== undefined && logPath !== '') {
    const sessionDirectory = path.dirname(logPath)
    await fs.rm(sessionDirectory, { recursive: true, force: true })
    removedFiles.push(logPath)
    removedDirectories.push(sessionDirectory)
    /* The per-Workspace bucket disappears once its last Session directory is gone. */
    await removeEmptyDirectory(path.dirname(sessionDirectory))
  }
  await dropProjectionCache(ctx, sessionId, removedFiles)
}

/**
 * Read the Session's tool calls and resolve the files they named.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @param cwd - the Session working directory every relative path resolves against.
 * @returns existing regular files inside `cwd`, deduplicated.
 */
async function collectSessionFiles(ctx, sessionId, cwd) {
  let events
  try {
    events = await readLogEvents(ctx, sessionId)
  } catch (error) {
    console.warn(`[session-delete] reading the log of ${sessionId} failed:`, error)
    return []
  }
  const seen = new Set()
  const candidates = []
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'tool/call') continue
    const data = event.data
    if (data === null || typeof data !== 'object') continue
    for (const raw of filePathsNamedByCall(data.name, data.arguments)) {
      const resolved = resolveInside(cwd, raw)
      if (resolved === undefined) continue
      const key = resolved.absolute.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(resolved)
      if (candidates.length >= MAX_TRACKED_FILES) return existingFiles(candidates)
    }
  }
  return existingFiles(candidates)
}

/**
 * Keep only candidates that are still regular files.
 * @param candidates - resolved absolute paths.
 * @returns the surviving entries.
 */
async function existingFiles(candidates) {
  const existing = []
  for (const candidate of candidates) {
    try {
      const info = await fs.stat(candidate.absolute)
      if (info.isFile()) existing.push(candidate)
    } catch {
      /* Deleted since the call, or never materialized: nothing to remove. */
    }
  }
  return existing
}

/**
 * Read every durable event of one Session through persistence validation.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns the event list.
 */
async function readLogEvents(ctx, sessionId) {
  let handle
  try {
    handle = await ctx.sessionPersistence.open(sessionId, 'read')
    const result = await handle.read()
    return result.events ?? []
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => {})
    }
  }
}

/**
 * Extract every path a file-writing tool call names.
 * @param name - tool name.
 * @param argumentsText - the call's raw JSON argument text.
 * @returns raw path spellings, unresolved.
 */
function filePathsNamedByCall(name, argumentsText) {
  if (typeof name !== 'string' || !FILE_WRITING_TOOLS.has(name)) return []
  if (typeof argumentsText !== 'string' || argumentsText === '') return []
  let args
  try {
    args = JSON.parse(argumentsText)
  } catch {
    return name === 'apply_patch' ? patchPaths(argumentsText) : []
  }
  if (args === null || typeof args !== 'object') return []
  const found = []
  for (const key of ['file_path', 'filePath', 'path', 'target_file', 'filename']) {
    if (typeof args[key] === 'string') found.push(args[key])
  }
  if (name === 'apply_patch') {
    for (const key of ['patch', 'input', 'diff']) {
      if (typeof args[key] === 'string') found.push(...patchPaths(args[key]))
    }
  }
  return found
}

/**
 * Read the `*** Add|Update|Delete File:` headers of a patch document.
 * @param text - patch body.
 * @returns raw path spellings.
 */
function patchPaths(text) {
  const paths = []
  for (const match of text.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\r\n]+)/g)) {
    paths.push(match[1].trim())
  }
  return paths
}

/**
 * Resolve one named path against the Session directory and prove it stays inside.
 * @param cwd - Session working directory.
 * @param raw - path exactly as the tool call spelled it.
 * @returns the absolute and workspace-relative spellings, or undefined when outside.
 */
function resolveInside(cwd, raw) {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.startsWith('~')) return undefined
  const absolute = path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(cwd, trimmed)
  const relative = path.relative(cwd, absolute)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return undefined
  return { absolute, relative: relative.split(path.sep).join('/') }
}

/**
 * Delete the selected project files, reporting failures instead of aborting.
 * @param files - resolved candidates.
 * @returns deleted and failed counts.
 */
async function removeProjectFiles(files) {
  const result = { deleted: 0, failed: 0 }
  for (const file of files) {
    try {
      await fs.rm(file.absolute, { force: true })
      result.deleted += 1
    } catch (error) {
      result.failed += 1
      console.warn(`[session-delete] removing ${file.absolute} failed:`, error)
    }
  }
  return result
}

/**
 * Drop one Session's row from the persisted projection cache.
 *
 * The cache service keeps the `session_projcache` domain open, so its table is
 * the authoritative handle: deleting through it updates memory and disk
 * together and cannot be rewritten by a later checkpoint. The per-record
 * document is removed directly only when that domain is unavailable.
 *
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @param removedFiles - accumulator for the report.
 */
async function dropProjectionCache(ctx, sessionId, removedFiles) {
  const facility = ctx.get('storageDomain')
  const domain = facility !== undefined && typeof facility.get === 'function'
    ? facility.get('session_projcache')
    : undefined
  if (domain !== undefined && typeof domain.table === 'function') {
    try {
      await domain.table('sessions').delete(sessionId)
      return
    } catch (error) {
      console.warn('[session-delete] projection cache delete failed:', error)
    }
  }
  const home = resolvedHome()
  if (home === undefined) return
  const record = path.join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`)
  await fs.rm(record, { force: true })
  removedFiles.push(record)
}

/**
 * Resolve the harness home the same way the rest of the installation does.
 * @returns the absolute home path, or undefined when neither source is usable.
 */
function resolvedHome() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  if (configured !== '') return configured
  const home = typeof os.homedir === 'function' ? os.homedir() : undefined
  return home === undefined ? undefined : path.join(home, '.dsh')
}

/**
 * Find the Workspace accounting that lists one Session.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns the Workspace entity, or undefined for an ungrouped Session.
 */
function findWorkspace(ctx, sessionId) {
  for (const candidate of ctx.workspaceRegistry.list()) {
    if (candidate.sessionIds.includes(sessionId)) return candidate
  }
  return undefined
}

/**
 * Resolve the directory a Session's file calls are relative to.
 * @param snapshot - persistence snapshot carrying the header.
 * @param workspace - Workspace accounting, when the Session has one.
 * @returns the absolute directory, or undefined when the Session has none.
 */
function sessionDirectoryOf(snapshot, workspace) {
  const cwd = snapshot.header !== undefined && typeof snapshot.header.cwd === 'string' && snapshot.header.cwd !== ''
    ? snapshot.header.cwd
    : undefined
  if (cwd !== undefined) return cwd
  return workspace === undefined ? undefined : workspace.path
}

/**
 * Read one Session's persisted title.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns the title, or an empty string when none is stored.
 */
async function sessionTitle(ctx, sessionId) {
  const titles = await sessionTitles(ctx, [sessionId])
  return titles.get(sessionId) ?? ''
}

/**
 * Read several Sessions' persisted titles.
 * @param ctx - owning plugin context.
 * @param ids - Session identities.
 * @returns a map of non-empty titles.
 */
async function sessionTitles(ctx, ids) {
  const titles = new Map()
  if (ids.length === 0) return titles
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined) return titles
  if (typeof sessionQuery.readTitleSnapshots === 'function') {
    try {
      const results = await sessionQuery.readTitleSnapshots(ids)
      for (const entry of results ?? []) {
        if (entry !== null && entry !== undefined && entry.status === 'fulfilled') {
          const title = entry.value?.title?.title
          if (typeof title === 'string' && title !== '') titles.set(entry.sessionId, title)
        }
      }
      return titles
    } catch (error) {
      console.warn('[session-delete] bulk title read failed:', error)
    }
  }
  if (typeof sessionQuery.readTitle === 'function') {
    for (const id of ids) {
      try {
        const snapshot = await sessionQuery.readTitle(id)
        if (typeof snapshot?.title === 'string' && snapshot.title !== '') titles.set(id, snapshot.title)
      } catch {
        /* A missing title is not a failure of the dialog. */
      }
    }
  }
  return titles
}

/**
 * List the Sessions related to one Session by lineage.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns ancestors and descendants with their titles and live state.
 */
async function relatedSessions(ctx, sessionId) {
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined || typeof sessionQuery.traceSession !== 'function') return []
  let trace
  try {
    trace = await sessionQuery.traceSession(sessionId)
  } catch (error) {
    console.warn('[session-delete] lineage trace failed:', error)
    return []
  }
  const rows = []
  for (const record of trace?.ancestors ?? []) {
    const id = record?.header?.id
    if (typeof id === 'string' && id !== sessionId) rows.push({ sessionId: id, relation: 'parent', depth: 0 })
  }
  const visit = (nodes, depth) => {
    for (const node of nodes ?? []) {
      const id = node?.session?.header?.id
      if (typeof id === 'string' && id !== sessionId) rows.push({ sessionId: id, relation: 'child', depth })
      visit(node?.descendants, depth + 1)
    }
  }
  visit(trace?.descendants, 1)
  const titles = await sessionTitles(ctx, rows.map((row) => row.sessionId))
  return rows.map((row) => ({
    sessionId: row.sessionId,
    title: titles.get(row.sessionId) ?? '',
    relation: row.relation,
    depth: row.depth,
    running: liveState(ctx, row.sessionId).running,
  }))
}

/**
 * Collect every descendant Session id of one Session.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns descendant ids in trace order; empty when lineage cannot be read.
 */
async function descendantIds(ctx, sessionId) {
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined || typeof sessionQuery.traceSession !== 'function') return []
  try {
    const trace = await sessionQuery.traceSession(sessionId)
    const ids = []
    const visit = (nodes) => {
      for (const node of nodes ?? []) {
        const id = node?.session?.header?.id
        if (typeof id === 'string' && id !== sessionId && !ids.includes(id)) ids.push(id)
        visit(node?.descendants)
      }
    }
    visit(trace?.descendants)
    return ids
  } catch (error) {
    console.warn('[session-delete] lineage trace failed:', error)
    return []
  }
}

/**
 * Report whether a Session still has a live Agent or Session object.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns live and running flags.
 */
function liveState(ctx, sessionId) {
  const agent = ctx.get('agents')?.get(sessionId)
  const session = ctx.get('sessions')?.get(sessionId)
  return {
    live: agent !== undefined || session !== undefined,
    running: agent !== undefined && agent.status === 'running',
  }
}

/**
 * Close a live Session the way the harness closes one: dispose the Agent's
 * scope, which runs the loop teardown that cancels the turn, flushes the log,
 * closes the write handle and detaches the Session from the store.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 * @returns success, or the stable refusal the client shows.
 */
async function closeLiveSession(ctx, sessionId) {
  const state = liveState(ctx, sessionId)
  if (!state.live) return { ok: true, closed: false }
  if (state.running) cancelTurn(ctx, sessionId)

  const agent = ctx.get('agents')?.get(sessionId)
  const lifecycle = agent === undefined ? undefined : lifecycleDisposer(agent, sessionId)
  if (lifecycle !== undefined) {
    try {
      await withTimeout(lifecycle(), 20000)
    } catch (error) {
      console.warn(`[session-delete] stopping ${sessionId} failed:`, error)
    }
  }

  let gone = await waitFor(() => liveState(ctx, sessionId).live === false, 8000)
  if (!gone && agent !== undefined) {
    /* Fallback: at least unwind the agent's own scope, then look again. */
    const scope = agent.scope
    if (scope !== undefined && typeof scope.dispose === 'function') {
      try {
        await withTimeout(scope.dispose(), 5000)
      } catch (error) {
        console.warn(`[session-delete] disposing the scope of ${sessionId} failed:`, error)
      }
      gone = await waitFor(() => liveState(ctx, sessionId).live === false, 3000)
    }
  }
  if (!gone) {
    return { ok: false, code: 'session/active', message: 'The session could not be closed.' }
  }
  return { ok: true, closed: true }
}

/**
 * Find the Agent Loop's lifecycle effect for one Agent and return its disposer.
 *
 * The loop registers `agentLoop.scope(<id>)` on its runtime context; disposing
 * that effect runs the exact teardown a Host shutdown would run for this Agent
 * (cancel the turn, flush the log, close the write handle, detach the Session
 * and the Agent) without touching any other Agent. Cordis exposes effect
 * metadata but not effect handles, so the wrapper is located by its label.
 *
 * @param agent - live Agent object.
 * @param sessionId - exact Session identity.
 * @returns the disposer, or undefined when the effect cannot be located.
 */
function lifecycleDisposer(agent, sessionId) {
  try {
    const fiber = agent.loopCtx !== undefined ? agent.loopCtx.fiber : undefined
    const list = fiber !== undefined ? fiber._disposables : undefined
    if (list === undefined || list === null) return undefined
    const values = Array.isArray(list)
      ? list
      : list.map instanceof Map
        ? [...list.map.values()]
        : []
    const label = `agentLoop.scope(${sessionId})`
    for (const value of values) {
      if (typeof value !== 'function') continue
      for (const symbol of Object.getOwnPropertySymbols(value)) {
        const meta = value[symbol]
        if (meta !== null && typeof meta === 'object' && meta.label === label) return value
      }
    }
  } catch (error) {
    console.warn('[session-delete] locating the agent lifecycle effect failed:', error)
  }
  return undefined
}

/**
 * Ask the Session Controller to stop one running turn before the Agent closes.
 * @param ctx - owning plugin context.
 * @param sessionId - exact Session identity.
 */
function cancelTurn(ctx, sessionId) {
  const controller = ctx.get('sessionController')
  if (controller === undefined || typeof controller.cancel !== 'function') return
  try {
    controller.cancel({ sessionId })
  } catch (error) {
    console.warn(`[session-delete] cancelling ${sessionId} failed:`, error)
  }
}

/**
 * Bound a promise with a timeout.
 * @param promise - work to bound.
 * @param ms - maximum wait.
 * @returns the promise result, or a rejection when the timeout wins.
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(ms)} ms`))
    }, ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Poll a synchronous predicate until it holds or the budget expires.
 * @param predicate - condition to observe.
 * @param ms - maximum wait.
 * @returns whether the predicate held.
 */
async function waitFor(predicate, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return predicate()
}

/**
 * Remove a directory only when it is already empty.
 * @param directory - candidate parent directory.
 */
async function removeEmptyDirectory(directory) {
  try {
    await fs.rmdir(directory)
  } catch {
    /* Still populated, or already gone: leaving it is the correct outcome. */
  }
}

/**
 * Run a best-effort cleanup step without failing the deletion.
 * @param operation - cleanup to attempt.
 * @param label - step name for the diagnostic.
 * @param sessionId - Session the step belongs to.
 */
async function ignore(operation, label, sessionId) {
  try {
    await operation()
  } catch (error) {
    console.warn(`[session-delete] ${label} failed for ${sessionId}:`, error)
  }
}

/**
 * Build a JSON response.
 * @param value - response payload.
 * @param status - HTTP status.
 * @returns the Fetch response.
 */
function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
