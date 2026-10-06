import { getAgentDir, VERSION } from '@earendil-works/pi-coding-agent'
import type { RuntimeInfoDto } from '@shared/ipc'
import { detectCli } from './cli-info'

/**
 * Report the SDK version PiUI embeds, the globally installed CLI version, and
 * whether they match. A mismatch matters because both read the same agent
 * directory and session files, whose schema is versioned.
 */
export async function getRuntimeInfo(): Promise<RuntimeInfoDto> {
  const agentDir = getAgentDir()
  const cli = await detectCli(agentDir)

  return {
    sdkVersion: VERSION,
    cliVersion: cli.version,
    cliPath: cli.path,
    versionMatch: cli.version !== null && cli.version === VERSION,
    agentDir,
    node: process.versions.node ?? ''
  }
}
