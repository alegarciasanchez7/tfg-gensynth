import { afterEach, describe, expect, it, vi } from 'vitest';
import { openExternalUrl, type JCEFWindow } from './jcef';

const URL_TO_OPEN = 'https://forms.gle/example';

describe('openExternalUrl', () => {
  afterEach(() => {
    delete (window as JCEFWindow).javaBridge;
    vi.restoreAllMocks();
  });

  it('asks Java to open the link in the desktop app', async () => {
    const postMessage = vi.fn().mockResolvedValue({ status: 'ok' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    (window as JCEFWindow).javaBridge = { sendToCore: vi.fn(), registerCallback: vi.fn(), postMessage };

    await openExternalUrl(URL_TO_OPEN);

    const request = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(request.type).toBe('OPEN_EXTERNAL_URL');
    expect(request.payload).toEqual({ url: URL_TO_OPEN });
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a new browser tab in browser mode', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    await openExternalUrl(URL_TO_OPEN);

    expect(open).toHaveBeenCalledWith(URL_TO_OPEN, '_blank', 'noopener,noreferrer');
  });

  it('rejects when Java refuses the link', async () => {
    const postMessage = vi.fn().mockRejectedValue(new Error('URL not allowed'));
    (window as JCEFWindow).javaBridge = { sendToCore: vi.fn(), registerCallback: vi.fn(), postMessage };

    await expect(openExternalUrl(URL_TO_OPEN)).rejects.toThrow('URL not allowed');
  });
});
