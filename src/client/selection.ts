
import type { ToolchainResult } from '../core/toolchain';

export type StartBlock = 'disabled' | 'untrusted' | 'noWorkspace' | 'missingCli' | 'invalidCli';

export interface StartDecision {
  allowed: boolean;
  reason?: StartBlock;
  executable?: string;
}

/** Only a verified Gungnir CLI is eligible to serve editor data. */
export function decideServerStart(
  trusted: boolean,
  enabled: boolean,
  workspacePresent: boolean,
  toolchain: ToolchainResult,
): StartDecision {
  if (!enabled) return { allowed: false, reason: 'disabled' };
  if (!trusted) return { allowed: false, reason: 'untrusted' };
  if (!workspacePresent) return { allowed: false, reason: 'noWorkspace' };
  if ((toolchain.state === 'ready' || toolchain.state === 'partial')
    && toolchain.executable && toolchain.version) {
    return { allowed: true, executable: toolchain.executable };
  }
  return { allowed: false, reason: toolchain.state === 'invalid' ? 'invalidCli' : 'missingCli' };
}
