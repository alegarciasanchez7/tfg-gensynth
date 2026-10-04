import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ConnectorPluginDescriptor } from '../../core/types';
import { ConnectorConfigForm } from './ConnectorConfigForm';

const connector: ConnectorPluginDescriptor = {
  pluginId: 'rabbitmq',
  displayName: 'RabbitMQ',
  pluginVersion: '1.0.0',
  description: 'Publishes to an exchange.',
  apiVersion: '1.0',
  external: true,
  fields: [
    { key: 'host', type: 'TEXT', label: 'Host', tooltip: 'Broker host name or IP', required: true, defaultValue: null, placeholder: 'localhost', options: [] },
    { key: 'port', type: 'INTEGER', label: 'Port', tooltip: '', required: false, defaultValue: 5672, placeholder: '', min: 1, max: 65535, options: [] },
    { key: 'password', type: 'PASSWORD', label: 'Password', tooltip: '', required: true, defaultValue: null, placeholder: '', options: [] },
    { key: 'durable', type: 'BOOLEAN', label: 'Durable', tooltip: '', required: false, defaultValue: true, placeholder: '', options: [] },
    {
      key: 'exchangeType', type: 'SELECT', label: 'Exchange type', tooltip: '', required: false, defaultValue: 'topic', placeholder: '',
      options: [{ value: 'topic', label: 'Topic exchange' }, { value: 'fanout', label: 'Fanout exchange' }],
    },
  ],
};

function Harness({ initial = {}, showAllErrors = false, onChange = vi.fn() }: {
  initial?: Record<string, unknown>;
  showAllErrors?: boolean;
  onChange?: (config: Record<string, unknown>) => void;
}) {
  const [config, setConfig] = useState(initial);
  return (
    <ConnectorConfigForm
      connector={connector}
      config={config}
      showAllErrors={showAllErrors}
      onChange={(next) => {
        setConfig(next);
        onChange(next);
      }}
    />
  );
}

describe('ConnectorConfigForm', () => {
  beforeAll(() => {
    // Radix tooltips measure their trigger; jsdom has no ResizeObserver
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => cleanup());

  it('renders the plugin fields in order with labels, placeholders and required marks', () => {
    const { container } = render(<Harness initial={{ port: 5672, durable: true, exchangeType: 'topic' }} />);

    expect(screen.getByText('Connection · RabbitMQ')).toBeInTheDocument();
    expect(screen.getByText('Publishes to an exchange.')).toBeInTheDocument();
    const labels = Array.from(container.querySelectorAll('label')).map((label) => label.textContent);
    expect(labels).toEqual(['Host*', 'Port', 'Password*', 'Durable', 'Exchange type']);
    expect(screen.getByLabelText(/^Host/)).toHaveAttribute('placeholder', 'localhost');
    expect(screen.getByLabelText(/^Port/)).toHaveValue(5672);
    expect(screen.getByRole('switch', { name: 'Durable' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('option', { name: 'Fanout exchange' })).toBeInTheDocument();
  });

  it('shows the field tooltip from its info icon', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.hover(screen.getByRole('button', { name: 'About Host' }));

    expect((await screen.findAllByText('Broker host name or IP')).length).toBeGreaterThan(0);
  });

  it('masks passwords until revealed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const password = screen.getByLabelText(/^Password/);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show Password' }));

    expect(password).toHaveAttribute('type', 'text');
  });

  it('reports typed values and validation errors once a field is edited', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Port/), { target: { value: '70000' } });

    expect(onChange).toHaveBeenLastCalledWith({ port: 70000 });
    expect(screen.getByRole('alert')).toHaveTextContent('Port must be at most 65535');
    expect(screen.getByLabelText(/^Port/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows every error at once when editing an existing flow', () => {
    render(<Harness showAllErrors />);
    const errors = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(errors).toEqual(['Host is required', 'Password is required']);
  });

  it('explains when a connector needs no configuration', () => {
    render(<ConnectorConfigForm connector={{ ...connector, fields: [] }} config={{}} onChange={vi.fn()} />);
    expect(screen.getByText('RabbitMQ does not need any configuration.')).toBeInTheDocument();
  });
});
