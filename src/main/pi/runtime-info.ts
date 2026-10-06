import type { RuntimeInfoDto } from '@shared/ipc'
import { detectCli } from './cli-info'
import { sdk, sdkPath } from './sdk'

/**
 * Report the pi version PiUI is running on, the installed CLI version, and
 * whether they match.
 *
 * PiUI prefers the SDK from the installed pi release (see `sdk.ts`), so the two
 * normally agree; a mismatch means no usable release was found and the bundled
 * copy is in use, which matters because both read the same agent directory and
 * session files, whose schema is versioned.
 */
export async function getRuntimeInfo(): Promise<RuntimeInfoDto> {
  const { getAgentDir, VERSION } = sdk()
  const agentDir = getAgentDir()
  const cli = await detectCli(agentDir)

  return {
    sdkVersion: VERSION,
    cliVersion: cli.version,
    cliPath: cli.path,
    versionMatch: cli.version === null || cli.version === VERSION,
    agentDir,
    node: process.versions.node ?? '',
    sdkPath: sdkPath()
  }
}
