import type { ListItemConfig, ListVariableConfig, PointVariableConfig, Variable, VariableType } from '../../../types';
import { SYSTEM_PLACEHOLDERS } from '../../../core/templatePlaceholders';
import { listItemText } from '../../../core/listItemText';

/** An entry of the template autocomplete. */
export interface AutocompleteOption {
  name: string;
  scope: string;
  detail?: string;
}

/** Text an option inserts between the braces: built-ins as is, variables with their scope. */
export const optionReference = (option: AutocompleteOption): string =>
  option.scope === 'system' ? option.name : `${option.scope}.${option.name}`;

/**
 * Options that match what the user typed after `{{`, matched against the text the option shows
 * (its name) and inserts (`scope.name`): prefix matches first, then substring matches, each group
 * in its original order. An empty query keeps every option.
 */
export function filterAutocompleteOptions<T extends AutocompleteOption>(options: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  const prefix: T[] = [];
  const substring: T[] = [];
  for (const option of options) {
    const texts = [option.name.toLowerCase(), optionReference(option).toLowerCase()];
    if (texts.some(text => text.startsWith(q))) prefix.push(option);
    else if (texts.some(text => text.includes(q))) substring.push(option);
  }
  return [...prefix, ...substring];
}

/** A sub-property suggested for a variable: its name and the detail shown next to it. */
type PropertySpec = readonly [property: string, detail: string];

/** Text of a list item: its value, else its embedded type, else its position. */
function listItemValue(item: Pick<ListItemConfig, 'value' | 'embeddedType'>, idx: number): string {
  if (item.value !== undefined && item.value !== '') return listItemText(item.value);
  return item.embeddedType ? item.embeddedType : `Item ${idx + 1}`;
}

/** Position of an item in the list order (by id, else by value); unordered items go last. */
function itemOrderIndex(orderMap: Map<string, number>, item: { id: string; value: string }): number {
  if (orderMap.has(item.id)) return orderMap.get(item.id)!;
  if (orderMap.has(String(item.value))) return orderMap.get(String(item.value))!;
  return 99999;
}

/** Items of a list in the order it generates them (a list only has its own items). */
export function getEffectiveListItems(v: Variable): Array<{ id: string; label: string }> {
  const config: ListVariableConfig = v.config || {};
  const rawItems: readonly unknown[] = config.items || [];
  const combined = rawItems.map((item, idx) => {
    if (typeof item === 'object' && item !== null) {
      const listItem = item as ListItemConfig;
      return { id: listItem.id || `item_${idx + 1}`, value: listItemValue(listItem, idx) };
    }
    return { id: `item_${idx + 1}`, value: String(item) };
  });

  if (config.itemOrder && Array.isArray(config.itemOrder) && config.itemOrder.length > 0) {
    const orderMap = new Map<string, number>(config.itemOrder.map((id: string, index: number) => [id, index]));
    combined.sort((a, b) => itemOrderIndex(orderMap, a) - itemOrderIndex(orderMap, b));
  }

  return combined.map((item, idx) => ({
    id: item.id || `item_${idx}`,
    label: item.value ? String(item.value) : `Item ${idx + 1}`,
  }));
}

/** Options for sub-properties of a variable (`name.property`). */
const propertyOptions = (v: Variable, specs: readonly PropertySpec[]): AutocompleteOption[] =>
  specs.map(([property, detail]) => ({ name: `${v.name}.${property}`, scope: v.scope, detail }));

const GEOSPATIAL_PROPERTIES: readonly PropertySpec[] = [
  ['latitude', 'Latitude (Degrees / DMS)'],
  ['longitude', 'Longitude (Degrees / DMS)'],
  ['altitude', 'Altitude'],
  ['altitudeUnit', 'Altitude Unit'],
  ['altitudeReference', 'Altitude Reference'],
];
const DMS_DECIMAL_PROPERTIES: readonly PropertySpec[] = [
  ['latitudeDecimal', 'Latitude (Decimal Degrees)'],
  ['longitudeDecimal', 'Longitude (Decimal Degrees)'],
];
const XY_PROPERTIES: readonly PropertySpec[] = [
  ['x', 'X Coordinate'],
  ['y', 'Y Coordinate'],
];
const XYZ_PROPERTIES: readonly PropertySpec[] = [...XY_PROPERTIES, ['z', 'Z Coordinate']];
const GRAPH_PROPERTIES: readonly PropertySpec[] = [
  ['nodeName', 'Graph Node Display Name'],
  ['nodeId', 'Graph Node ID'],
  ['targetNodeName', 'Target Node Display Name'],
  ['targetNodeId', 'Target Node ID'],
  ['isPaused', 'Stopped at a Node (true/false)'],
];

/** Variable types whose options are the value plus a fixed list of sub-properties. */
const SIMPLE_TYPE_OPTIONS: Partial<Record<VariableType, { detail: string; properties: readonly PropertySpec[] }>> = {
  temporal: {
    detail: 'Formatted Date/Time',
    properties: [
      ['monthText', 'Month Name (August, January...)'],
      ['monthShort', 'Short Month Name (Jan, Feb...)'],
      ['monthNumber', 'Month Number (1-12)'],
      ['year', 'Year (e.g. 2026)'],
      ['day', 'Day of Month (1-31)'],
      ['dayOfWeek', 'Day of Week (Monday...)'],
      ['dayOfWeekNumber', 'Day of Week Number (1-7)'],
      ['hour', 'Hour (0-23)'],
      ['minute', 'Minute (0-59)'],
      ['second', 'Second (0-59)'],
      ['timestamp', 'Epoch Milliseconds'],
      ['timezone', 'Time Zone (e.g. UTC)'],
    ],
  },
  numeric: {
    detail: 'Numeric Value',
    properties: [
      ['integerPart', 'Integer Part'],
      ['decimalPart', 'Fractional Decimal Part'],
      ['abs', 'Absolute Value'],
      ['round', 'Rounded Value'],
      ['floor', 'Rounded Down'],
      ['ceil', 'Rounded Up'],
      ['sign', 'Sign (-1, 0 or 1)'],
    ],
  },
  string: {
    detail: 'String Value',
    properties: [
      ['length', 'String Length'],
      ['upper', 'Uppercase String'],
      ['lower', 'Lowercase String'],
      ['trim', 'Without Surrounding Spaces'],
      ['firstChar', 'First Character'],
      ['lastChar', 'Last Character'],
    ],
  },
  boolean: {
    detail: 'Boolean Value (true/false)',
    properties: [
      ['inverse', 'Inverse Boolean (false/true)'],
      ['asNumber', 'Binary Number (1 or 0)'],
      ['asString', 'Text ("true" / "false")'],
      ['upper', 'Uppercase (TRUE / FALSE)'],
    ],
  },
};

function listOptions(v: Variable): AutocompleteOption[] {
  // Same default as the Core and the list editor
  const strategy = v.config?.selectionStrategy || 'WEIGHTED_RANDOM';
  const isFixedSubset = strategy === 'FIXED_SUBSET';
  const value: AutocompleteOption = {
    name: v.name,
    scope: v.scope,
    detail: isFixedSubset ? 'Fixed Subset / Entire List' : 'Single Item Selection',
  };
  // Size/first/last and item access are offered for Fixed Subset only. Other strategies
  // yield a single item each tick: the Core still resolves size/first/last (1 / the item)
  // and the highlight accepts them, but suggesting them would be misleading
  if (!isFixedSubset) return [value];
  return [
    value,
    ...propertyOptions(v, [['size', 'List Item Count'], ['first', 'First List Item'], ['last', 'Last List Item']]),
    ...getEffectiveListItems(v).map((item, index) => ({
      name: `${v.name}.item${index}`,
      scope: v.scope,
      detail: `item${index} (${item.label})`,
    })),
  ];
}

/** Coordinate sub-properties of a point for its coordinate system (and geospatial format). */
function pointCoordinateProperties(config: Variable['config'] | undefined): readonly PropertySpec[] {
  // Same default as the Core and the point editor
  const coordSys = config?.coordinateSystem || 'CARTESIAN_3D';
  if (coordSys === 'GEOSPATIAL') {
    return config?.geospatialFormat === 'DEGREES_MINUTES_SECONDS'
      ? [...GEOSPATIAL_PROPERTIES, ...DMS_DECIMAL_PROPERTIES]
      : GEOSPATIAL_PROPERTIES;
  }
  return coordSys === 'CARTESIAN_3D' ? XYZ_PROPERTIES : XY_PROPERTIES;
}

function pointOptions(v: Variable): AutocompleteOption[] {
  const options: AutocompleteOption[] = [
    { name: v.name, scope: v.scope, detail: 'Full Point Object' },
    ...propertyOptions(v, pointCoordinateProperties(v.config)),
  ];
  const config: PointVariableConfig | undefined = v.config;
  if (config?.pattern === 'GRAPH_ROUTE' || (config?.graphNodes && config.graphNodes.length > 0)) {
    options.push(...propertyOptions(v, GRAPH_PROPERTIES));
  }
  return options;
}

/** Autocomplete options of one variable: its value and the sub-properties of its type. */
export function variableAutocompleteOptions(v: Variable): AutocompleteOption[] {
  if (v.type === 'list') return listOptions(v);
  if (v.type === 'point') return pointOptions(v);
  const simple = SIMPLE_TYPE_OPTIONS[v.type];
  if (!simple) return [{ name: v.name, scope: v.scope }];
  return [{ name: v.name, scope: v.scope, detail: simple.detail }, ...propertyOptions(v, simple.properties)];
}

/** Whether a flow can reference a variable: global ones, its group's and its own local ones. */
export function isVariableAccessible(v: Variable, flowId: string, groupId: string): boolean {
  if (v.scope === 'global') return true;
  if (v.scope === 'group') return v.groupId === groupId;
  if (v.scope === 'local') return v.flowId === flowId;
  return false;
}

/** Every autocomplete option of a flow: the built-in placeholders, then the reachable variables. */
export function buildAutocompleteOptions(
  variables: readonly Variable[],
  flowId: string,
  groupId: string,
): AutocompleteOption[] {
  const system: AutocompleteOption[] = SYSTEM_PLACEHOLDERS.map(p => ({ name: p.name, scope: 'system', detail: p.detail }));
  return [
    ...system,
    ...variables.filter(v => isVariableAccessible(v, flowId, groupId)).flatMap(variableAutocompleteOptions),
  ];
}

/**
 * What the user typed after the last `{{` before the cursor (trimmed, lower case), or null when
 * there is no `{{` before the cursor.
 */
export function autocompleteQuery(value: string, cursorPos: number): string | null {
  const textBeforeCursor = value.substring(0, cursorPos);
  const lastBraces = textBeforeCursor.lastIndexOf('{{');
  if (lastBraces === -1) return null;
  return textBeforeCursor.substring(lastBraces + 2).trim().toLowerCase();
}
