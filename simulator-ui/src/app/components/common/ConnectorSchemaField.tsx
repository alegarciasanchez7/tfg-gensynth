
import { FolderOpen } from "lucide-react";
import { Button } from "../ui/button";
import { isRunningInJCEF } from "../../core/jcef";
import { CoreCommands } from "../../core/bridge";
import { FieldRow } from "./FieldRow";

export type ConnectorSchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: Array<string | number | boolean>;
  items?: ConnectorSchemaProperty;
  properties?: Record<string, ConnectorSchemaProperty>;
};

export function getDefaultValue(definition: ConnectorSchemaProperty): unknown {
  if (Object.prototype.hasOwnProperty.call(definition, "default")) {
    return definition.default;
  }

  if (definition.enum?.length) {
    return definition.enum[0];
  }

  switch (definition.type) {
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}

export function stringifyConnectorValue(
  value: unknown,
  definition: ConnectorSchemaProperty
): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (definition.type === "array") {
    return Array.isArray(value) ? value.join(", ") : String(value);
  }

  if (definition.type === "object") {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

interface ConnectorSchemaFieldProps {
  name: string;
  definition: ConnectorSchemaProperty;
  value: unknown;
  onChange: (name: string, nextValue: unknown) => void;
}

export function ConnectorSchemaField({
  name,
  definition,
  value,
  onChange,
}: ConnectorSchemaFieldProps) {
  const label = definition.title ?? name;
  const description = definition.description;

  if (definition.enum && definition.enum.length > 0) {
    return (
      <FieldRow label={label}>
        <select
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => onChange(name, event.target.value)}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {definition.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
        {description && (
          <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>
        )}
      </FieldRow>
    );
  }

  if (definition.type === "boolean") {
    return (
      <FieldRow label={label}>
        <button
          type="button"
          onClick={() => onChange(name, !Boolean(value))}
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border text-[11px] transition-all ${
            Boolean(value)
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
              : "bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx3)]"
          }`}
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <span>{Boolean(value) ? "true" : "false"}</span>
          <span className="text-[9px] uppercase">toggle</span>
        </button>
        {description && (
          <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>
        )}
      </FieldRow>
    );
  }

  if (definition.type === "number" || definition.type === "integer") {
    return (
      <FieldRow label={label}>
        <input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) =>
            onChange(
              name,
              event.target.value === "" ? "" : Number(event.target.value)
            )
          }
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
        {description && (
          <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>
        )}
      </FieldRow>
    );
  }

  if (definition.type === "array") {
    return (
      <FieldRow label={label}>
        <textarea
          value={stringifyConnectorValue(value, definition)}
          onChange={(event) =>
            onChange(
              name,
              event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            )
          }
          rows={3}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full resize-none"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
        {description && (
          <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>
        )}
      </FieldRow>
    );
  }

  if (definition.type === "object") {
    return (
      <FieldRow label={label}>
        <textarea
          value={stringifyConnectorValue(value, definition)}
          onChange={(event) => {
            try {
              onChange(
                name,
                event.target.value ? JSON.parse(event.target.value) : {}
              );
            } catch {
              onChange(name, event.target.value);
            }
          }}
          rows={4}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full resize-none"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
        {description && (
          <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>
        )}
      </FieldRow>
    );
  }

  const isDirectoryField =
    name.toLowerCase().includes("dir") ||
    name.toLowerCase().includes("path") ||
    label.toLowerCase().includes("directory") ||
    label.toLowerCase().includes("path");

  return (
    <FieldRow label={label}>
      <div className="flex gap-2">
        <input
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => onChange(name, event.target.value)}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        />
        {isDirectoryField && isRunningInJCEF() && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={async () => {
              const response = await CoreCommands.pickDirectory();
              if (
                response &&
                response.status === "success" &&
                (response as any).path
              ) {
                onChange(name, (response as any).path);
              }
            }}
            className="h-8 w-8 shrink-0 border-[var(--c-br1)] bg-[var(--c-bg1)] hover:bg-[var(--c-bg5)]"
            title="Browse directory"
          >
            <FolderOpen size={14} />
          </Button>
        )}
      </div>
      {description && (
        <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>
      )}
    </FieldRow>
  );
}
