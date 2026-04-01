import { describe, it, expect } from 'vitest';
import { generateProjectOverview } from '../lib/project.js';
import { join } from 'path';

const DEV = join(import.meta.dirname, '..', '..');

describe('Project Overview', () => {
  it('generates overview for project itself', () => {
    const overview = generateProjectOverview(join(import.meta.dirname, '..'));
    // Folder name on disk may vary — just check structure is present
    expect(overview).toContain('Structure');
    expect(overview).toContain('index.js');
    expect(overview).toContain('lib/');
  });

  it('includes git status', () => {
    const overview = generateProjectOverview(join(import.meta.dirname, '..'));
    expect(overview).toContain('Git');
  });

  it('detects entry points from package.json', () => {
    const overview = generateProjectOverview(join(import.meta.dirname, '..'));
    expect(overview).toContain('Entry Points');
    expect(overview).toContain('index.js');
  });

  it('includes compressed config files', () => {
    const overview = generateProjectOverview(join(import.meta.dirname, '..'));
    expect(overview).toContain('package.json');
  });

  it('does not include node_modules in tree', () => {
    const overview = generateProjectOverview(join(import.meta.dirname, '..'));
    expect(overview).not.toContain('node_modules');
  });

  it('does not include .git in tree', () => {
    const overview = generateProjectOverview(join(import.meta.dirname, '..'));
    // .git starts with . which is filtered
    const treeSection = overview.split('Structure')[1]?.split('Config')[0] || '';
    expect(treeSection).not.toContain('.git');
  });

  it('handles non-existent directory gracefully', () => {
    const overview = generateProjectOverview('/tmp/nonexistent-dir-12345');
    expect(typeof overview).toBe('string');
  });
});
