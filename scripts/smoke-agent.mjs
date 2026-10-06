/**
 * Smoke-test the pi SDK the way PiUI's main process uses it: an inline
 * extension loaded through DefaultResourceLoader, a session, and extension
 * binding with a GUI-style UI context.
 *
 * Run with: node scripts/smoke-agent.mjs
 */
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  VERSION
} from '@earendil-works/pi-coding-agent'

const agentDir = getAgentDir()
const cwd = process.cwd()

let hookCalls = 0
const approvalExtension = {
  name: 'piui-approval-smoke',
  factory: (pi) => {
    pi.on('tool_call', async () => {
      hookCalls += 1
      return undefined
    })
  }
}

/** GUI-style UI context: only the members PiUI actually implements. */
const uiContext = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === 'theme') return {}
      if (key === 'getToolsExpanded') return () => false
      if (key === 'getEditorText') return () => ''
      if (key === 'getEditorComponent') return () => undefined
      if (key === 'getAllThemes') return () => []
      if (key === 'getTheme') return () => undefined
      if (key === 'setTheme') return () => ({ success: false })
      return () => undefined
    }
  }
)

const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir,
  extensionFactories: [approvalExtension]
})
await resourceLoader.reload()

const { session } = await createAgentSession({ cwd, agentDir, resourceLoader })
await session.bindExtensions({ uiContext, mode: 'rpc' })

const usage = session.getContextUsage()

console.log('sdk version   :', VERSION)
console.log('agent dir     :', agentDir)
console.log('cwd           :', cwd)
console.log(
  'model         :',
  session.model ? `${session.model.provider}/${session.model.id}` : '(none)'
)
console.log('thinking      :', session.getAvailableThinkingLevels().join(', '))
console.log('active tools  :', session.getActiveToolNames().join(', '))
console.log(
  'context       :',
  usage ? `${usage.tokens ?? '?'}/${usage.contextWindow}` : '(unavailable)'
)
console.log('approval hook : registered, calls so far =', hookCalls)
console.log('session id    :', session.sessionId)

session.dispose()
console.log('OK')
