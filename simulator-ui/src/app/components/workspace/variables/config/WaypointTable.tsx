import React from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { FullPoint } from '../../../../core/pointDefaults';
import { CommitInput } from '../../../common/CommitInput';
import { Button } from '../../../ui/button';

export type WaypointAxis = 'x' | 'y' | 'z';

interface WaypointTableProps {
  waypoints: FullPoint[];
  /** Hides the Z column (2D Cartesian). */
  showZ: boolean;
  /** Geospatial headers (Lat / Lon / Alt) instead of X / Y / Z. */
  isGeo: boolean;
  /** Commits a typed coordinate; returns false when it is rejected (the field restores its value). */
  onEditCoord: (index: number, axis: WaypointAxis, raw: string) => boolean;
  /** Swaps a waypoint with its neighbour (-1 = up, 1 = down). */
  onMoveRow: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  /** Problem of each row (null when valid), shown as a red number with the reason as tooltip. */
  rowIssues?: (string | null)[];
  /** Lets the table grow with its container (fullscreen side panel) instead of scrolling at 220 px. */
  fill?: boolean;
}

const inputClass =
  'h-6 w-full min-w-0 px-1.5 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-cyan-600 dark:text-cyan-300 text-xs font-mono focus:border-cyan-500 focus:outline-none';
const iconButtonClass =
  'p-0.5 rounded text-[var(--c-tx4)] hover:text-cyan-500 hover:bg-[var(--c-bg5)] disabled:opacity-30 disabled:pointer-events-none transition-colors';

/**
 * Ordered list of waypoints: one row per waypoint with editable coordinates and reorder / delete
 * buttons. Rows that break the region or obstacle rules show their number in red.
 */
export const WaypointTable: React.FC<WaypointTableProps> = ({
  waypoints,
  showZ,
  isGeo,
  onEditCoord,
  onMoveRow,
  onDelete,
  onAdd,
  rowIssues = [],
  fill = false,
}) => {
  const axes: { axis: WaypointAxis; header: string; name: string }[] = [
    { axis: 'x', header: isGeo ? 'Lat' : 'X', name: isGeo ? 'latitude' : 'X' },
    { axis: 'y', header: isGeo ? 'Lon' : 'Y', name: isGeo ? 'longitude' : 'Y' },
    ...(showZ ? [{ axis: 'z' as const, header: isGeo ? 'Alt' : 'Z', name: isGeo ? 'altitude' : 'Z' }] : []),
  ];

  return (
    <div className="space-y-1.5">
      {waypoints.length > 0 && (
        <div className={`${fill ? '' : 'max-h-[220px] overflow-y-auto '}rounded border border-[var(--c-br2)]`}>
          <table className="w-full text-xs table-fixed">
            <thead className="bg-[var(--c-bg3)] text-[10px] uppercase text-[var(--c-tx4)]">
              <tr>
                <th className="w-8 px-1.5 py-1 text-left font-semibold">#</th>
                {axes.map(({ axis, header }) => (
                  <th key={axis} className="px-1 py-1 text-left font-semibold">{header}</th>
                ))}
                <th className="w-[72px] px-1 py-1" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {waypoints.map((wp, i) => {
                const issue = rowIssues[i] ?? null;
                return (
                  <tr key={i} className="border-t border-[var(--c-br2)]" data-invalid={issue ? 'true' : undefined}>
                    <td
                      className={`px-1.5 py-1 font-mono text-[10px] ${issue ? 'font-bold text-rose-600 dark:text-rose-400 cursor-help' : 'text-[var(--c-tx3)]'}`}
                      title={issue ?? undefined}
                    >
                      {i + 1}
                    </td>
                    {axes.map(({ axis, name }) => (
                      <td key={axis} className="px-1 py-1">
                        <CommitInput
                          value={String(wp[axis])}
                          ariaLabel={`Waypoint ${i + 1} ${name}`}
                          inputMode="decimal"
                          onCommit={(raw) => onEditCoord(i, axis, raw)}
                          className={inputClass}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          aria-label={`Move waypoint ${i + 1} up`}
                          title="Move up"
                          disabled={i === 0}
                          onClick={() => onMoveRow(i, -1)}
                          className={iconButtonClass}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move waypoint ${i + 1} down`}
                          title="Move down"
                          disabled={i === waypoints.length - 1}
                          onClick={() => onMoveRow(i, 1)}
                          className={iconButtonClass}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete waypoint ${i + 1}`}
                          title="Delete"
                          onClick={() => onDelete(i)}
                          className={`${iconButtonClass} hover:!text-rose-400`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={onAdd}>
        <Plus size={12} />
        <span>Add waypoint</span>
      </Button>
    </div>
  );
};
