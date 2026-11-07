import { describe, it, expect, vi } from 'vitest';
import { MessageHandler } from './MessageHandler';
import type { BridgeConfig } from './BridgeConfig';
import type { EventMap } from './BridgeTypes';

type Emit = <K extends keyof EventMap>(event: K, data: EventMap[K]) => void;

describe('MessageHandler', () => {
  const handler = (emit: Emit) => new MessageHandler({
    config: {} as BridgeConfig,
    pendingCommands: new Map(),
    emit,
    sendRaw: vi.fn(),
  });

  it('emits the projects the Core asks the desktop window to open', () => {
    const emit = vi.fn<Emit>();

    handler(emit).handleMessage(JSON.stringify({
      type: 'OPEN_PROJECT_REQUESTED', timestamp: 1, payload: { filePath: '/p/plant.gsynth' },
    }));
    handler(emit).handleMessage(JSON.stringify({ type: 'OPEN_PROJECT_REQUESTED', timestamp: 2 }));

    expect(emit).toHaveBeenCalledWith('open-project-requested', { filePath: '/p/plant.gsynth' });
    // Without a payload: a new project
    expect(emit).toHaveBeenCalledWith('open-project-requested', {});
  });
});
