import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

export type ToolchainState = 'ready' | 'partial' | 'missing' | 'invalid' | 'untrusted';
export type CandidateSource = 'configured' | 'sdkRoot' | 'environment' | 'PATH';

export interface ToolchainResult {
  state: ToolchainState;
  message: string;
  source?: CandidateSource;
  executable?: string;
  version?: string;
  compiler?: string;
  compilerVersion?: string;
  sdkRoot?: string;
  sdkProfile?: string;
  sdkVerified?: boolean;
  diagnostics: string[];
}

export interface DiscoveryOptions {
  executablePath?: string;
  sdkRoot?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
}

export interface ProbeIO {
  isExecutable(file: string): Promise<boolean>;
  isFile(file: string): Promise<boolean>;
  readText(file: string): Promise<string | undefined>;
  version(file: string, timeoutMs: number): Promise<string>;
}

export const realProbeIO: ProbeIO = {
  async isExecutable(file) {
    try {
      if (!(await stat(file)).isFile()) return false;
      await access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  async isFile(file) {
    try { return (await stat(file)).isFile(); } catch { return false; }
  },
  async readText(file) {
    try { return await readFile(file, 'utf8'); } catch { return undefined; }
  },
  version(file, timeoutMs) {
    return new Promise((resolve, reject) => {
      execFile(file, ['--version'], {
        shell: false,
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024,
      }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
  },
};

function parseVersion(output: string, compiler: boolean): string | undefined {
  const match = output.match(compiler
    ? /^Gungnir compiler\s+([^\s()]+)/i
    : /^Gungnir\s+([^\s()]+)/i);
  return match?.[1];
}

function failed(state: ToolchainState, message: string): ToolchainResult {
  return { state, message, diagnostics: [message] };
}

export async function discoverToolchain(
  options: DiscoveryOptions = {},
  io: ProbeIO = realProbeIO,
): Promise<ToolchainResult> {
  const platform = options.platform ?? process.platform;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const isWin = platform === 'win32';
  const env = options.environment ?? process.env;
  const executableName = isWin ? 'gungnir.exe' : 'gungnir';
  const compilerName = isWin ? 'gungnirc.exe' : 'gungnirc';
  const timeout = Math.max(500, Math.min(options.timeoutMs ?? 3000, 10000));
  const configured = options.executablePath?.trim() ?? '';
  const configuredRoot = options.sdkRoot?.trim() ?? '';
  const environmentRoot = env.GUNGNIR_CMAKE_PREFIX?.trim() ?? '';

  // Explicit settings are authoritative: never silently choose a different binary.
  if (configured && !paths.isAbsolute(configured)) {
    return failed('invalid', 'gungnir.executablePath must be an absolute file path.');
  }
  if (configuredRoot && !paths.isAbsolute(configuredRoot)) {
    return failed('invalid', 'gungnir.sdkRoot must be an absolute directory path.');
  }

  const candidates: { file: string; source: CandidateSource }[] = [];
  if (configured) {
    candidates.push({ file: configured, source: 'configured' });
  } else if (configuredRoot) {
    candidates.push({ file: paths.join(configuredRoot, 'bin', executableName), source: 'sdkRoot' });
  } else {
    if (environmentRoot && paths.isAbsolute(environmentRoot)) {
      candidates.push({ file: paths.join(environmentRoot, 'bin', executableName), source: 'environment' });
    }
    for (const raw of (env.PATH ?? env.Path ?? '').split(isWin ? ';' : ':')) {
      const directory = raw.trim().replace(/^"(.*)"$/, '$1');
      // Empty/relative PATH entries can execute code from untrusted working directories.
      if (directory && paths.isAbsolute(directory)) {
        candidates.push({ file: paths.join(directory, executableName), source: 'PATH' });
      }
    }
  }

  const seen = new Set<string>();
  let selection: { file: string; source: CandidateSource } | undefined;
  for (const candidate of candidates) {
    const normalized = paths.normalize(candidate.file);
    const key = isWin ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    if (await io.isExecutable(normalized)) {
      selection = { ...candidate, file: normalized };
      break;
    }
  }
  if (!selection) {
    const message = configured
      ? 'Configured Gungnir executable was not found or is not executable: ' + configured
      : configuredRoot
        ? 'Gungnir was not found in the configured SDK bin directory: ' + configuredRoot
        : 'Gungnir is not installed on PATH. Install the SDK or configure gungnir.executablePath.';
    return failed(configured || configuredRoot ? 'invalid' : 'missing', message);
  }

  const diagnostics: string[] = [];
  let version: string;
  try {
    const output = await io.version(selection.file, timeout);
    const parsed = parseVersion(output, false);
    if (!parsed) {
      return { state: 'invalid', executable: selection.file, source: selection.source,
        message: 'Executable did not return a Gungnir version.', diagnostics: ['Expected "Gungnir <version>" from --version.'] };
    }
    version = parsed;
  } catch (error) {
    const message = 'Could not run Gungnir --version: ' +
      (error instanceof Error ? error.message : String(error));
    return { state: 'invalid', executable: selection.file, source: selection.source,
      message, diagnostics: [message] };
  }

  const compiler = paths.join(paths.dirname(selection.file), compilerName);
  let compilerVersion: string | undefined;
  if (await io.isExecutable(compiler)) {
    try {
      compilerVersion = parseVersion(await io.version(compiler, timeout), true);
      if (!compilerVersion) diagnostics.push('gungnirc returned an unrecognized version.');
      else if (compilerVersion !== version) diagnostics.push(
        'Version mismatch: gungnir ' + version + ', gungnirc ' + compilerVersion + '.',
      );
    } catch {
      diagnostics.push('gungnirc exists but its version check failed.');
    }
  } else {
    diagnostics.push('gungnirc was not found next to gungnir; compiler commands may be unavailable.');
  }

  const sdkRoot = paths.dirname(paths.dirname(selection.file));
  const header = paths.join(sdkRoot, 'include', 'gungnir', 'gungnir.hpp');
  const cmake = [
    paths.join(sdkRoot, 'lib', 'cmake', 'Gungnir', 'GungnirConfig.cmake'),
    paths.join(sdkRoot, 'lib64', 'cmake', 'Gungnir', 'GungnirConfig.cmake'),
  ];
  const sdkVerified = await io.isFile(header) && (
    (await io.isFile(cmake[0])) || (await io.isFile(cmake[1]))
  );
  if (!sdkVerified) diagnostics.push(
    'Adjacent SDK headers/CMake package not found; this CLI may be from a build tree.',
  );

  const manifest = await io.readText(paths.join(sdkRoot, 'share', 'gungnir', 'sdk.txt'));
  const profile = manifest?.match(/^profile\s*=\s*(core|application)\s*$/im)?.[1];
  const sdkProfile = profile?.toLowerCase();
  const state: ToolchainState = diagnostics.length ? 'partial' : 'ready';
  const message = state === 'ready'
    ? 'Gungnir ' + version + ' SDK detected.'
    : 'Gungnir ' + version + ' CLI detected with setup warnings.';
  return {
    state, message, source: selection.source, executable: selection.file,
    version, compiler: await io.isExecutable(compiler) ? compiler : undefined,
    compilerVersion, sdkRoot, sdkProfile, sdkVerified, diagnostics,
  };
}
