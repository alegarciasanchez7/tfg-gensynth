import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FormatConverterModal, convertFormatClientSide } from './FormatConverterModal';

describe('FormatConverterModal', () => {
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

  it('converts json to xml correctly in client side utility', () => {
    const json = '{"id": 123, "name": "test"}';
    const xml = convertFormatClientSide(json, 'json', 'xml');

    expect(xml).toContain('<root>');
    expect(xml).toContain('<id>123</id>');
    expect(xml).toContain('<name>test</name>');
  });

  it('converts json to csv correctly in client side utility', () => {
    const json = '{"id": 123, "name": "test"}';
    const csv = convertFormatClientSide(json, 'json', 'csv');

    expect(csv).toContain('id,name');
    expect(csv).toContain('123,test');
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
});

