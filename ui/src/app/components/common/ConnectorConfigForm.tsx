import { useMemo, useState } from 'react';
import { ChevronRight, Eye, EyeOff, FolderOpen, Info, Plug } from 'lucide-react';
import type { ConnectorFieldDescriptor, ConnectorPluginDescriptor } from '../../core/types';
import { validateConnectorConfig, type ConnectorConfigValues } from '../../core/connectorFields';
import { CoreCommands } from '../../core/bridge';
import { isRunningInJCEF } from '../../core/jcef';
import { Switch } from '../ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

const INPUT_CLASS =
  'bg-[var(--c-bg1)] border rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full placeholder:text-[var(--c-tx5)]';
const MONO = { fontFamily: 'JetBrains Mono, monospace' };

interface ConnectorConfigFormProps {
  connector: ConnectorPluginDescriptor;
  config: ConnectorConfigValues;
  onChange: (nextConfig: ConnectorConfigValues) => void;
  /** Show every error from the start (editing an existing flow); otherwise only after a field is edited. */
  showAllErrors?: boolean;
}

/** Whether a value was set to something other than the field default (an empty value is the default). */
function differsFromDefault(field: ConnectorFieldDescriptor, value: unknown): boolean {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return false;
  return toTextValue(value) !== toTextValue(field.defaultValue);
}

/**
 * Connection section of a flow: renders the fields declared by the connector plugin, in the
 * plugin's order, with their tooltips, required marks and validation errors. Fields marked as
 * advanced go into a collapsed "Advanced options" section, which opens by itself when one of
 * them has a value of its own or an error.
 */
export function ConnectorConfigForm({ connector, config, onChange, showAllErrors = false }: Readonly<ConnectorConfigFormProps>) {
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const errors = useMemo(() => validateConnectorConfig(connector.fields, config), [connector.fields, config]);
  const basicFields = connector.fields.filter((field) => !field.advanced);
  const advancedFields = connector.fields.filter((field) => field.advanced);
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    advancedFields.some((field) => differsFromDefault(field, config[field.key])));

  const update = (key: string, value: unknown) => {
    setTouched((previous) => new Set(previous).add(key));
    onChange({ ...config, [key]: value });
  };

  const visibleError = (key: string) => (showAllErrors || touched.has(key) ? errors[key] : undefined);
  // An error inside the section is never hidden
  const showAdvanced = advancedOpen || advancedFields.some((field) => visibleError(field.key));

  const renderField = (field: ConnectorFieldDescriptor) => (
    <ConnectorFieldInput
      key={field.key}
      field={field}
      value={config[field.key]}
      error={visibleError(field.key)}
      onChange={(value) => update(field.key, value)}
    />
  );

  return (
    <section className="flex flex-col gap-3" aria-label={`Connection settings for ${connector.displayName}`}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase flex items-center gap-1.5" style={MONO}>
          <Plug size={10} /> Connection · {connector.displayName}
        </span>
        {connector.description && (
          <span className="text-[10px] text-[var(--c-tx4)]" style={MONO}>{connector.description}</span>
        )}
      </div>

      {connector.fields.length === 0 ? (
        <div className="rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-3 text-[10px] text-[var(--c-tx4)]" style={MONO}>
          {connector.displayName} does not need any configuration.
        </div>
      ) : (
        basicFields.map(renderField)
      )}

      {advancedFields.length > 0 && (
        <Collapsible open={showAdvanced} onOpenChange={setAdvancedOpen} className="flex flex-col gap-3">
          <CollapsibleTrigger
            className="flex items-center gap-1.5 self-start text-[10px] text-[var(--c-tx4)] hover:text-cyan-500 tracking-wider uppercase transition-colors"
            style={MONO}
          >
            <ChevronRight size={11} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
            Advanced options ({advancedFields.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3 border-l border-[var(--c-br2)] pl-3">
            {advancedFields.map(renderField)}
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}

interface ConnectorFieldInputProps {
  field: ConnectorFieldDescriptor;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}

/** Text shown in an input for a connector config value (the values are scalars; objects are shown as JSON). */
function toTextValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as string | number | boolean | bigint);
}

function ConnectorFieldInput({ field, value, error, onChange }: Readonly<ConnectorFieldInputProps>) {
  const [revealed, setRevealed] = useState(false);
  const id = `connector-field-${field.key}`;
  const errorId = `${id}-error`;
  const borderClass = error ? 'border-red-500/60' : 'border-[var(--c-br1)]';
  const textValue = toTextValue(value);
  const isDirectoryField = field.type === 'TEXT' && /dir|path/i.test(field.key);

  const inputProps = {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
    'aria-required': field.required,
    placeholder: field.placeholder,
    className: `${INPUT_CLASS} ${borderClass}`,
    style: MONO,
  };

  let control;
  switch (field.type) {
    case 'BOOLEAN':
      control = (
        <Switch
          id={id}
          aria-label={field.label}
          checked={value === true || value === 'true'}
          onCheckedChange={(checked) => onChange(checked)}
          className="data-[state=checked]:bg-cyan-500"
        />
      );
      break;
    case 'SELECT':
      control = (
        <select {...inputProps} value={textValue} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      );
      break;
    case 'INTEGER':
    case 'DECIMAL':
      control = (
        <input
          {...inputProps}
          type="number"
          step={field.type === 'INTEGER' ? 1 : 'any'}
          min={field.min}
          max={field.max}
          value={textValue}
          onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
        />
      );
      break;
    case 'PASSWORD':
      control = (
        <div className="flex gap-1.5">
          <input
            {...inputProps}
            type={revealed ? 'text' : 'password'}
            autoComplete="new-password"
            value={textValue}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? `Hide ${field.label}` : `Show ${field.label}`}
            className="shrink-0 px-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] text-[var(--c-tx4)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-colors"
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      );
      break;
    default:
      control = (
        <div className="flex gap-1.5">
          <input {...inputProps} value={textValue} onChange={(event) => onChange(event.target.value)} />
          {isDirectoryField && isRunningInJCEF() && (
            <button
              type="button"
              title="Browse directory"
              aria-label={`Browse ${field.label}`}
              onClick={async () => {
                const response = (await CoreCommands.pickDirectory()) as { status?: string; path?: string } | undefined;
                if (response?.status === 'success' && response.path) onChange(response.path);
              }}
              className="shrink-0 px-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] text-[var(--c-tx4)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-colors"
            >
              <FolderOpen size={12} />
            </button>
          )}
        </div>
      );
  }

  return (
    <div className={`flex gap-1 ${field.type === 'BOOLEAN' ? 'flex-row items-center justify-between' : 'flex-col'}`}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[10px] text-[var(--c-tx3)] tracking-wider uppercase" style={MONO}>
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
        {field.tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${field.label}`}
                className="text-[var(--c-tx4)] hover:text-cyan-500 cursor-help transition-colors"
              >
                <Info size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">{field.tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {control}
      {error && (
        <span id={errorId} role="alert" className="text-[10px] text-red-600 dark:text-red-400" style={MONO}>
          {error}
        </span>
      )}
    </div>
  );
}
