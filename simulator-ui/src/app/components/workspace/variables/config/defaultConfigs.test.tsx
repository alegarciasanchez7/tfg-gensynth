import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  BooleanVariableConfig,
  NumericVariableConfig,
  PointVariableConfig,
  StringVariableConfig,
  TemporalVariableConfig,
} from '../../../../types';
import { TooltipProvider } from '../../../ui/tooltip';

vi.mock('../../../../context', () => ({
  useApp: () => ({ state: { variables: [], groups: [] } }),
}));

import { DEFAULT_TEMPORAL_FORMAT, defaultConfigForType, defaultConfigTextForType, stringModeDefaults } from './defaultConfigs';
import { BooleanConfigPanel } from './BooleanConfigPanel';
import { TemporalConfigPanel } from './TemporalConfigPanel';
import { NumericConfigPanel } from './NumericConfigPanel';
import { StringConfigPanel } from './StringConfigPanel';
import { PointConfigPanel } from './PointConfigPanel';

const inTooltips = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe('defaultConfigForType', () => {
  it('starts a Boolean OFF explicitly', () => {
    expect(defaultConfigForType('boolean')).toEqual({ pattern: 'CONSTANT_BOOLEAN', currentValue: false });
  });

  it('gives each type only its own settings', () => {
    expect(defaultConfigForType('temporal')).not.toHaveProperty('min');
    expect(defaultConfigForType('list')).toEqual({ selectionStrategy: 'WEIGHTED_RANDOM', items: [] });
    expect(JSON.parse(defaultConfigTextForType('string'))).toEqual(defaultConfigForType('string'));
  });

  it('shows OFF in the Boolean editor', () => {
    inTooltips(<BooleanConfigPanel config={defaultConfigForType('boolean') as BooleanVariableConfig} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByText(/OFF \/ false/)).toBeInTheDocument();
  });

  it('shows the documented format preset in the Temporal editor, not Custom', () => {
    inTooltips(<TemporalConfigPanel config={defaultConfigForType('temporal') as TemporalVariableConfig} onChange={vi.fn()} />);
    expect(document.getElementById('date-format-preset')).toHaveTextContent(DEFAULT_TEMPORAL_FORMAT);
    expect(screen.getByLabelText(/Custom Format/i)).toHaveValue(DEFAULT_TEMPORAL_FORMAT);
  });

  it('shows the sent range and precision in the Numeric editor', () => {
    render(<NumericConfigPanel config={defaultConfigForType('numeric') as NumericVariableConfig} onChange={vi.fn()} />);
    expect(screen.getByTestId('numeric-min-input')).toHaveValue('0');
    expect(screen.getByTestId('numeric-max-input')).toHaveValue('100');
    expect(document.getElementById('numeric-precision')).toHaveTextContent('Float');
  });

  it('shows the sent length in the String editor', () => {
    render(<StringConfigPanel config={defaultConfigForType('string') as StringVariableConfig} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Fixed Length/i)).toHaveValue(8);
  });

  it('shows the sent system and pattern in the Point editor', () => {
    render(<PointConfigPanel config={defaultConfigForType('point') as PointVariableConfig} onChange={vi.fn()} />);
    expect(document.getElementById('point-coord-system')).toHaveTextContent('3D Cartesian');
    expect(document.getElementById('point-pattern')).toHaveTextContent('Random Point');
  });
});

describe('stringModeDefaults', () => {
  const base = defaultConfigForType('string') as StringVariableConfig;

  it('gives every String mode the settings it needs to generate non-empty text', () => {
    expect(stringModeDefaults('RANDOM_STRING', base)).toEqual({});
    expect(stringModeDefaults('RANDOM_STRING', { ...base, fixedLength: 0 })).toEqual({ fixedLength: 8 });
    expect(stringModeDefaults('REGEX', base).regexPattern).toBeTruthy();
    expect(stringModeDefaults('CONSTANT', base).constantValue).toBeTruthy();
    expect(stringModeDefaults('TEMPLATE', base).template).toBeTruthy();
    expect(stringModeDefaults('FORMATTED_MASK', base)).toEqual({ formattedMaskType: 'ALPHANUMERIC', customMask: '????????' });
  });

  it('keeps values the config already has', () => {
    expect(stringModeDefaults('REGEX', { ...base, regexPattern: '[a-z]+' })).toEqual({});
    expect(stringModeDefaults('CONSTANT', { ...base, constantValue: 'x' })).toEqual({});
    expect(stringModeDefaults('TEMPLATE', { ...base, template: '{{a}}' })).toEqual({});
    expect(stringModeDefaults('FORMATTED_MASK', { ...base, formattedMaskType: 'CUSTOM_MASK', customMask: '##' })).toEqual({});
    // Preset masks need no pattern
    expect(stringModeDefaults('FORMATTED_MASK', { ...base, formattedMaskType: 'UUID_V4' })).toEqual({});
  });
});
