import type { Flow, Group } from '../types';

/**
 * Legacy fields of a flow, deprecated in {@link Flow}: ignored by the engine and never edited
 * in the UI, but still read from old project files and sent back to the Core so they round-trip.
 */
export interface LegacyFlowFields {
  throughput: string;
  interval: number;
  burst: number;
}

/** Legacy fields of a group, deprecated in {@link Group} (same round-trip as {@link LegacyFlowFields}). */
export interface LegacyGroupFields {
  throughput: string;
  threads: number;
}

/**
 * The legacy fields of a flow. Every read of them goes through here, the single
 * backward-compatibility path, so the rest of the UI never touches the deprecated fields.
 */
export function legacyFlowFields(flow: Flow): LegacyFlowFields;
export function legacyFlowFields(flow: Partial<Flow>): Partial<LegacyFlowFields>;
export function legacyFlowFields(flow: Partial<Flow>): Partial<LegacyFlowFields> {
  return flow;
}

/** The legacy fields of a group (see {@link legacyFlowFields}). */
export function legacyGroupFields(group: Group): LegacyGroupFields;
export function legacyGroupFields(group: Partial<Group>): Partial<LegacyGroupFields>;
export function legacyGroupFields(group: Partial<Group>): Partial<LegacyGroupFields> {
  return group;
}
