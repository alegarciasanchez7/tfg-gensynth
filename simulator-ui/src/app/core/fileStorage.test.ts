import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PROJECT_FILE_EXTENSION,
  PROJECT_FORMAT_ID,
  PROJECT_FORMAT_VERSION,
  createProjectSnapshot,
  loadProjectSnapshotFromFile,
  triggerFileSelection,
} from './fileStorage';
import { DEFAULT_PROJECT_SETTINGS } from './tickSettings';

function projectFile(content: unknown, name = `project${PROJECT_FILE_EXTENSION}`): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([text], name, { type: 'application/json' });
}

const validProject = {
  format: PROJECT_FORMAT_ID,
  version: PROJECT_FORMAT_VERSION,
  exportedAt: '2026-01-01T00:00:00.000Z',
  groups: [{ id: 'g1', name: 'Group 1', flows: [] }],
  variables: [{ id: 'v1', name: 'Var 1' }],
};

describe('fileStorage project format', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createProjectSnapshot writes the format marker, version and settings', () => {
    const settings = { tick: { mode: 'AS_FAST_AS_POSSIBLE', value: 1, unit: 'SECONDS' } } as const;
    const snapshot = createProjectSnapshot([], [], settings);
    expect(snapshot.format).toBe(PROJECT_FORMAT_ID);
    expect(snapshot.version).toBe('1.1.0');
    expect(snapshot.version).toBe(PROJECT_FORMAT_VERSION);
    expect(snapshot.settings).toEqual(settings);
  });

  it('loads 1.0.0 project files without settings using the default settings', async () => {
    const snapshot = await loadProjectSnapshotFromFile(projectFile({ ...validProject, version: '1.0.0' }));
    expect(snapshot.settings).toEqual(DEFAULT_PROJECT_SETTINGS);
  });

  it('keeps valid settings and replaces invalid ones with the defaults', async () => {
    const tick = { mode: 'FIXED_RATE', value: 250, unit: 'MILLISECONDS' };
    const valid = await loadProjectSnapshotFromFile(projectFile({ ...validProject, settings: { tick } }));
    expect(valid.settings).toEqual({ tick });

    const invalid = await loadProjectSnapshotFromFile(
      projectFile({ ...validProject, settings: { tick: { mode: 'FIXED_RATE', value: 0, unit: 'SECONDS' } } }),
    );
    expect(invalid.settings).toEqual(DEFAULT_PROJECT_SETTINGS);
  });

  it('loads a valid project file and normalizes its content', async () => {
    const snapshot = await loadProjectSnapshotFromFile(projectFile(validProject));
    expect(snapshot.format).toBe(PROJECT_FORMAT_ID);
    expect(snapshot.groups[0].id).toBe('g1');
    expect(snapshot.groups[0].status).toBe('stopped');
    expect(snapshot.variables[0].type).toBe('string');
  });

  it('rejects files without the project extension', async () => {
    await expect(loadProjectSnapshotFromFile(projectFile(validProject, 'project.json'))).rejects.toThrow(
      PROJECT_FILE_EXTENSION,
    );
  });

  it('rejects project files without a format marker', async () => {
    const { format: _format, ...withoutFormat } = validProject;
    await expect(loadProjectSnapshotFromFile(projectFile(withoutFormat))).rejects.toThrow('format');
  });

  it('rejects project files with an unknown format marker', async () => {
    await expect(
      loadProjectSnapshotFromFile(projectFile({ ...validProject, format: 'other-app' })),
    ).rejects.toThrow('format');
  });

  it('rejects project files with invalid JSON content', async () => {
    await expect(loadProjectSnapshotFromFile(projectFile('{ not json'))).rejects.toThrow('invalid JSON');
  });

  it('file selection only accepts project files', async () => {
    let createdInput: HTMLInputElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (element instanceof HTMLInputElement) {
        createdInput = element;
        vi.spyOn(element, 'click').mockImplementation(() => {
          element.dispatchEvent(new Event('cancel'));
        });
      }
      return element;
    });

    await expect(triggerFileSelection()).resolves.toBeNull();
    expect(createdInput).not.toBeNull();
    expect(createdInput!.accept).toBe(PROJECT_FILE_EXTENSION);
  });
});
