import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingRow } from './SettingRow';

describe('SettingRow', () => {
  afterEach(() => cleanup());

  it('renders the title, description and control, linking the title to the control', () => {
    render(
      <SettingRow icon={<span>icon</span>} title="Auto-save" description="Every 30s" htmlFor="ctrl">
        <input id="ctrl" />
      </SettingRow>,
    );

    expect(screen.getByText('Every 30s')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-save')).toBe(document.getElementById('ctrl'));
  });

  it('omits the description when none is given', () => {
    const { container } = render(<SettingRow icon={<span />} title="Only title" />);
    expect(screen.getByText('Only title')).toBeInTheDocument();
    expect(container.querySelectorAll('span.text-\\[10px\\]')).toHaveLength(0);
  });
});
