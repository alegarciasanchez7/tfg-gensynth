import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const { reportUiErrorToCore } = vi.hoisted(() => ({ reportUiErrorToCore: vi.fn(async () => undefined) }));
vi.mock('../../core/uiErrorReporter', () => ({ reportUiErrorToCore }));

import { AppErrorBoundary } from './AppErrorBoundary';

function Crash(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'color')");
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders its children when nothing fails', () => {
    render(<AppErrorBoundary><p>App content</p></AppErrorBoundary>);

    expect(screen.getByText('App content')).toBeInTheDocument();
  });

  it('shows a recoverable message instead of a blank page and logs the error', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReload = vi.fn();
    // jsdom reports errors thrown while rendering as uncaught: keep the test output clean
    const silence = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', silence);
    onTestFinished(() => window.removeEventListener('error', silence));

    render(<AppErrorBoundary onReload={onReload}><Crash /></AppErrorBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('alert')).toHaveTextContent("reading 'color'");
    expect(consoleError).toHaveBeenCalled();
    expect(reportUiErrorToCore).toHaveBeenCalledWith(expect.stringContaining("reading 'color'"));

    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
