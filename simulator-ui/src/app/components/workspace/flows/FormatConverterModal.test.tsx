import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { FormatConverterModal } from './FormatConverterModal';
import type { TemplateFormat } from './templateFormat';

describe('FormatConverterModal', () => {
  afterEach(() => cleanup());

  it('renders dialog when open', () => {
    render(
      <FormatConverterModal
        isOpen={true}
        onOpenChange={vi.fn()}
        currentContent='{"id": 123}'
        currentFormat="json"
        onApplyConversion={vi.fn()}
      />
    );

    expect(screen.getByText('Convert Message Format')).toBeDefined();
    expect(screen.getByText('Apply to Flow Template')).toBeDefined();
  });

  it('calls onApplyConversion when button is clicked', () => {
    const handleApply = vi.fn();
    const handleOpenChange = vi.fn();

    render(
      <FormatConverterModal
        isOpen={true}
        onOpenChange={handleOpenChange}
        currentContent='{"id": 123}'
        currentFormat="json"
        onApplyConversion={handleApply}
      />
    );

    fireEvent.click(screen.getByText('Apply to Flow Template'));

    expect(handleApply).toHaveBeenCalledWith(expect.any(String), 'xml');
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('only changes the label when the template already is valid in the target format', () => {
    const handleApply = vi.fn();
    render(
      <FormatConverterModal
        isOpen={true}
        onOpenChange={vi.fn()}
        currentContent={'id,t\n{{uuid}},{{temperature}}'}
        currentFormat="plain"
        initialTargetFormat="csv"
        onApplyConversion={handleApply}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('already valid CSV');
    fireEvent.click(screen.getByRole('button', { name: 'Set format to CSV' }));
    expect(handleApply).toHaveBeenCalledWith('id,t\n{{uuid}},{{temperature}}', 'csv');
  });

  /** Renders the dialog for a conversion and returns the apply spy. */
  const renderConversion = (content: string, from: TemplateFormat, to: TemplateFormat) => {
    const handleApply = vi.fn();
    render(
      <FormatConverterModal
        isOpen={true}
        onOpenChange={vi.fn()}
        currentContent={content}
        currentFormat={from}
        initialTargetFormat={to}
        onApplyConversion={handleApply}
      />
    );
    return handleApply;
  };

  it('blocks nested JSON to CSV with an explanation', () => {
    const handleApply = renderConversion('{"id": 1, "pos": {"lat": 1, "lon": 2}}', 'json', 'csv');

    expect(screen.getByRole('alert')).toHaveTextContent('"pos" contains a nested object or list');
    const apply = screen.getByRole('button', { name: 'Apply to Flow Template' });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(handleApply).not.toHaveBeenCalled();
  });

  it('converts JSON with a bare numeric placeholder to XML', () => {
    const handleApply = renderConversion('{"t": {{temperature}}}', 'json', 'xml');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Flow Template' }));
    expect(handleApply).toHaveBeenCalledWith(expect.stringContaining('<t>{{temperature}}</t>'), 'xml');
  });

  it('keeps plain text labelled CSV when converting it to JSON', () => {
    const handleApply = renderConversion('hello {{temp}}', 'csv', 'json');

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Flow Template' }));
    expect(JSON.parse(handleApply.mock.calls[0][0] as string)).toEqual({ message: 'hello {{temp}}' });
  });

  it('maps XML back to JSON fields', () => {
    const handleApply = renderConversion(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <id>{{uuid}}</id>\n  <t>21.5</t>\n</root>',
      'xml',
      'json',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Flow Template' }));
    expect(JSON.parse(handleApply.mock.calls[0][0] as string)).toEqual({ id: '{{uuid}}', t: 21.5 });
  });

  it('explains, with a matching disabled button, that JSON cannot be labelled PLAIN', () => {
    const handleApply = renderConversion('{"id": 1}', 'json', 'plain');

    expect(screen.getByRole('alert')).toHaveTextContent('JSON content always keeps the JSON label');
    expect(screen.queryByRole('button', { name: 'Set format to PLAIN' })).not.toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply to Flow Template' });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(handleApply).not.toHaveBeenCalled();
  });
});
