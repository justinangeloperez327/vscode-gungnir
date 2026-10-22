import { describe, expect, it } from 'vitest';
import {
  isLocalProjectMarker, parseWorkflowProblem, validateWorkflowExecutable, workflowPlan,
} from './workflow';

describe('Gungnir workflow CLI contract', () => {
  it('provides the exact supported native commands without invoking a shell', () => {
    expect(workflowPlan('build').args).toEqual(['build']);
    expect(workflowPlan('build', true).args).toEqual(['build', '--release']);
    expect(workflowPlan('run').args).toEqual(['run']);
    expect(workflowPlan('run', true).args).toEqual(['run', '--release']);
    expect(workflowPlan('dev').args).toEqual(['dev']);
    expect(workflowPlan('dev').background).toBe(true);
    expect(workflowPlan('build').background).toBe(false);
  });

  it('refuses unsupported commands or release dev mode', () => {
    for (const operation of ['migrate', 'make:model', 'dev --release', '../build', '']) {
      expect(() => workflowPlan(operation)).toThrow(/Unsupported/);
    }
    expect(() => workflowPlan('dev', true)).toThrow(/does not accept/);
    expect(() => validateWorkflowExecutable('./gungnir')).toThrow(/absolute/);
  });

  it('recognizes only the project-root marker', () => {
    expect(isLocalProjectMarker('/tmp/app', '/tmp/app/.gungnir-project')).toBe(true);
    expect(isLocalProjectMarker('/tmp/app', '/tmp/other/.gungnir-project')).toBe(false);
  });

  it('recognizes native diagnostic renderers, including Windows drive letters', () => {
    expect(parseWorkflowProblem('app/main.gnr:10:7: error[GNR1001]: Unknown route')).toEqual({
      file: 'app/main.gnr', line: 10, column: 7,
      severity: 'error', code: 'GNR1001', message: 'Unknown route',
    });
    expect(parseWorkflowProblem('C:\\work\\main.gnr:4:2: warning[GNR2100]: Deprecated')).toEqual({
      file: 'C:\\work\\main.gnr', line: 4, column: 2,
      severity: 'warning', code: 'GNR2100', message: 'Deprecated',
    });
    expect(parseWorkflowProblem('app/main.gnr:2:1 [GNR1002]: Syntax error')).toEqual({
      file: 'app/main.gnr', line: 2, column: 1, severity: 'error',
      code: 'GNR1002', message: 'Syntax error',
    });
    expect(parseWorkflowProblem('gungnir: error: CMake failed')).toBeUndefined();
  });
});
