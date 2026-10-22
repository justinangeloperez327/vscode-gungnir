import * as path from 'node:path';

export const GENERATORS = [
  { kind: 'model', label: 'Model', directory: 'app/models', suffix: '', structured: false, dependency: false },
  { kind: 'controller', label: 'Controller', directory: 'app/controllers', suffix: 'Controller', structured: false, dependency: false },
  { kind: 'middleware', label: 'Middleware', directory: 'app/middleware', suffix: 'Middleware', structured: false, dependency: false },
  { kind: 'migration', label: 'Migration', directory: 'database/migrations', suffix: '', structured: false, dependency: false },
  { kind: 'request', label: 'Request', directory: 'app/requests', suffix: 'Request', structured: true, dependency: false },
  { kind: 'job', label: 'Job', directory: 'app/jobs', suffix: 'Job', structured: true, dependency: false },
  { kind: 'event', label: 'Event', directory: 'app/events', suffix: '', structured: true, dependency: false },
  { kind: 'mail', label: 'Mail', directory: 'app/mail', suffix: 'Mail', structured: true, dependency: false },
  { kind: 'listener', label: 'Listener', directory: 'app/listeners', suffix: 'Listener', structured: true, dependency: true },
  { kind: 'policy', label: 'Policy', directory: 'app/policies', suffix: 'Policy', structured: true, dependency: true },
  { kind: 'notification', label: 'Notification', directory: 'app/notifications', suffix: 'Notification', structured: true, dependency: true },
] as const;

export type GeneratorKind = (typeof GENERATORS)[number]['kind'];
export type GeneratorSpec = (typeof GENERATORS)[number];

export function generatorSpec(kind: string): GeneratorSpec {
  const found = GENERATORS.find((generator) => generator.kind === kind);
  if (!found) throw new Error('Unsupported Gungnir generator: ' + kind);
  return found;
}

/** Conservative subset of CLI-accepted identifiers, with no path separators or shell metacharacters. */
export function validateName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) {
    throw new Error('Name must start with a letter and contain only letters, numbers, _ or - (max 64 characters).');
  }
  if (name.includes('__') || name.includes('--')) {
    throw new Error('Consecutive name separators are not supported.');
  }
  return name;
}

export function className(name: string): string {
  let uppercase = true;
  let result = '';
  for (const letter of validateName(name)) {
    if (letter === '-' || letter === '_') {
      uppercase = true;
    } else {
      result += uppercase ? letter.toUpperCase() : letter;
      uppercase = false;
    }
  }
  return result;
}

export function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function validateDependency(value: string): string {
  const dependency = value.trim();
  const parts = dependency.split('::');
  if (parts.length !== 2 || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(parts[0])
    || !/^[A-Za-z][A-Za-z0-9_]*$/.test(parts[1])) {
    throw new Error('Dependency must be a qualified declaration, e.g. app.events.UserCreated::UserCreated.');
  }
  return dependency;
}

export interface DeclarationPlan {
  kind: GeneratorKind;
  args: string[];
  relativePath: string;
  dependency?: string;
}

export function planDeclaration(kind: string, name: string, structured: boolean, dependency?: string): DeclarationPlan {
  const spec = generatorSpec(kind);
  if (spec.structured && !structured) {
    throw new Error('make:' + kind + ' requires profile=structured in .gungnir-project.');
  }
  const base = className(name);
  const normalized = spec.suffix && !base.endsWith(spec.suffix) ? base + spec.suffix : base;
  if (spec.dependency && !structured) throw new Error('Qualified dependencies require a structured project.');
  if (spec.dependency && !dependency) throw new Error('make:' + kind + ' needs a qualified event/model dependency.');
  if (!spec.dependency && dependency) throw new Error('make:' + kind + ' does not accept a dependency.');
  const qualified = dependency ? validateDependency(dependency) : undefined;
  const filename = (kind === 'migration' ? snakeCase(normalized) : normalized) + '.gnr';
  return {
    kind: spec.kind,
    args: ['make:' + kind, validateName(name), ...(qualified ? [qualified] : [])],
    relativePath: path.join(spec.directory, filename),
    dependency: qualified,
  };
}

export function isStructuredProject(marker: string): boolean {
  return /^profile\s*=\s*structured\s*$/m.test(marker);
}

/** Keep untrusted stdout paths from opening arbitrary files outside the selected project. */
export function safeGeneratedPath(root: string, candidate: string): string {
  if (!candidate || path.isAbsolute(candidate) || candidate.includes('\\') || candidate.includes('\0')) {
    throw new Error('Generator reported an unsafe source path.');
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  if (!resolved.startsWith(resolvedRoot + path.sep) || path.extname(resolved) !== '.gnr') {
    throw new Error('Generator source path must be a .gnr file inside the project.');
  }
  return resolved;
}

export function parseGeneratedSource(stdout: string, root: string): string {
  const lines = stdout.trim().split(/\r?\n/);
  const match = /^Created ([^\r\n]+)$/.exec(lines.at(-1) ?? '');
  if (!match) throw new Error('Gungnir did not report a created declaration path.');
  return safeGeneratedPath(root, match[1]);
}
