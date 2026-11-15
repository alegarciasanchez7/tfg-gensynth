import React, { useState } from 'react';
import { BoundaryObstacle, ObstacleType, Point3DCoord } from '../../../../types';
import { Plus, Trash2, ShieldAlert, Eye, EyeOff, Layers } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { centerOf } from '../../../../core/pointDefaults';
import { randomUUID } from '../../../../core/randomId';
import { parseVertexCoordinate, vertexRows } from './obstacleVertices';

/** Names of the two axes of the obstacle points: X/Y, or Latitude/Longitude on a map. */
export interface ObstacleAxisLabels {
  x: string;
  y: string;
}

/** Largest absolute value of each axis (geospatial: latitude 90, longitude 180); no limit if missing. */
export interface ObstacleAxisLimits {
  x?: number;
  y?: number;
}

const CARTESIAN_AXES: ObstacleAxisLabels = { x: 'X', y: 'Y' };
const NO_LIMITS: ObstacleAxisLimits = {};

interface BoundaryObstaclesEditorProps {
  obstacles: BoundaryObstacle[];
  /** Region bounds: new obstacles are placed at its centre and sized relative to it. */
  minPoint?: Point3DCoord;
  maxPoint?: Point3DCoord;
  selectedObstacleId?: string | null;
  onSelectObstacle?: (id: string | null) => void;
  onChange: (newObstacles: BoundaryObstacle[]) => void;
  axisLabels?: ObstacleAxisLabels;
  axisLimits?: ObstacleAxisLimits;
}

/** Text input of one vertex coordinate: keeps what is typed until Enter or leaving the field. */
const VertexCoordinateInput: React.FC<{
  id: string;
  label: string;
  value: number;
  limit?: number;
  onCommit: (value: number) => void;
}> = ({ id, label, value, limit, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseVertexCoordinate(draft, value, limit);
    setDraft(null);
    if (parsed !== null) onCommit(parsed);
  };

  return (
    <div className="flex-1 min-w-0 space-y-0.5">
      <Label htmlFor={id} className="text-[9px] text-[var(--c-tx4)]">{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="h-7 text-xs font-mono"
      />
    </div>
  );
};

/** Exact coordinates of the vertices of the selected obstacle, editable one by one. */
const ObstacleVerticesEditor: React.FC<{
  obstacle: BoundaryObstacle;
  axisLabels: ObstacleAxisLabels;
  axisLimits: ObstacleAxisLimits;
  onChange: (points: Point3DCoord[]) => void;
}> = ({ obstacle, axisLabels, axisLimits, onChange }) => {
  const setCoordinate = (index: number, axis: 'x' | 'y', value: number) => {
    onChange(obstacle.points.map((point, i) => (i === index ? { ...point, [axis]: value } : point)));
  };

  return (
    <div className="space-y-1.5 rounded border border-amber-400/30 bg-[var(--c-bg2)] p-2">
      <div className="text-[10px] font-semibold uppercase text-[var(--c-tx3)]">
        Vertices of {obstacle.name || 'Obstacle'}
      </div>
      {vertexRows(obstacle.points).map(({ point, key }, i) => (
        <div key={key} className="flex items-end gap-2">
          <span className="w-14 shrink-0 pb-1.5 text-[10px] font-mono text-[var(--c-tx4)]">Point {i + 1}</span>
          <VertexCoordinateInput
            id={`obs-${obstacle.id}-${i}-x`}
            label={axisLabels.x}
            value={point.x ?? 0}
            limit={axisLimits.x}
            onCommit={(value) => setCoordinate(i, 'x', value)}
          />
          <VertexCoordinateInput
            id={`obs-${obstacle.id}-${i}-y`}
            label={axisLabels.y}
            value={point.y ?? 0}
            limit={axisLimits.y}
            onCommit={(value) => setCoordinate(i, 'y', value)}
          />
        </div>
      ))}
    </div>
  );
};

/** Classes of an obstacle row: selected, enabled or disabled. */
const obstacleRowClass = (isSelected: boolean, enabled: boolean | undefined): string => {
  if (isSelected) return 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/40 text-amber-700 dark:text-amber-200 shadow-sm';
  return enabled
    ? 'border-amber-500/30 bg-amber-500/5 text-[var(--c-tx2)] hover:border-amber-400/50'
    : 'border-[var(--c-br1)] bg-[var(--c-bg2)] text-[var(--c-tx4)] opacity-60';
};

/** Icon colour of an obstacle row: the selection colour, or red for walls and amber for zones. */
const obstacleIconClass = (isSelected: boolean, type: ObstacleType): string => {
  if (isSelected) return 'text-amber-600 dark:text-amber-300';
  return type === 'WALL_SEGMENT' ? 'text-red-400' : 'text-amber-400';
};

export const BoundaryObstaclesEditor: React.FC<BoundaryObstaclesEditorProps> = ({
  obstacles = [],
  minPoint = { x: -50, y: -50 },
  maxPoint = { x: 50, y: 50 },
  selectedObstacleId,
  onSelectObstacle,
  onChange,
  axisLabels = CARTESIAN_AXES,
  axisLimits = NO_LIMITS,
}) => {
  const [newObstacleName, setNewObstacleName] = useState<string>('');
  const [newObstacleType, setNewObstacleType] = useState<ObstacleType>('WALL_SEGMENT');

  const selectedObstacle = obstacles.find((obs) => obs.id === selectedObstacleId);

  const handleAddObstacle = () => {
    const name = newObstacleName.trim() || (newObstacleType === 'WALL_SEGMENT' ? 'Wall Barrier' : 'Forbidden Zone');
    // Centred on the region: a wall 40% of its width, a zone 30% of its size
    const { x: cx, y: cy } = centerOf(minPoint, maxPoint);
    const spanX = Math.abs((maxPoint.x ?? 0) - (minPoint.x ?? 0)) || 100;
    const spanY = Math.abs((maxPoint.y ?? 0) - (minPoint.y ?? 0)) || 100;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const defaultPoints: Point3DCoord[] =
      newObstacleType === 'WALL_SEGMENT'
        ? [
            { x: round(cx - spanX * 0.2), y: round(cy), z: 0 },
            { x: round(cx + spanX * 0.2), y: round(cy), z: 0 },
          ]
        : [
            { x: round(cx - spanX * 0.15), y: round(cy - spanY * 0.15), z: 0 },
            { x: round(cx + spanX * 0.15), y: round(cy - spanY * 0.15), z: 0 },
            { x: round(cx + spanX * 0.15), y: round(cy + spanY * 0.15), z: 0 },
            { x: round(cx - spanX * 0.15), y: round(cy + spanY * 0.15), z: 0 },
          ];

    const newObs: BoundaryObstacle = {
      id: `obs_${randomUUID()}`,
      name,
      type: newObstacleType,
      points: defaultPoints,
      enabled: true,
    };

    onChange([...obstacles, newObs]);
    onSelectObstacle?.(newObs.id);
    setNewObstacleName('');
  };

  const handleToggleEnabled = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = obstacles.map((obs) => (obs.id === id ? { ...obs, enabled: !obs.enabled } : obs));
    onChange(updated);
  };

  const handleDeleteObstacle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = obstacles.filter((obs) => obs.id !== id);
    onChange(updated);
    if (selectedObstacleId === id) {
      onSelectObstacle?.(null);
    }
  };

  return (
    <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--c-br1)] pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--c-tx2)]">
          <ShieldAlert size={14} className="text-amber-400" />
          <span>Walls & Forbidden Interior Obstacle Zones ({obstacles.length})</span>
        </div>
      </div>

      {/* Creation form */}
      <div className="flex flex-wrap items-end gap-2 bg-[var(--c-bg2)] p-2 rounded border border-[var(--c-br1)]">
        <div className="flex-1 min-w-[140px] space-y-1">
          <Label htmlFor="obs-name-input" className="text-[10px] text-[var(--c-tx4)]">Obstacle Name</Label>
          <Input
            id="obs-name-input"
            type="text"
            placeholder="e.g. Living Room Wall"
            value={newObstacleName}
            onChange={(e) => setNewObstacleName(e.target.value)}
            className="h-7 text-xs font-mono"
          />
        </div>

        <div className="w-60 space-y-1">
          <Label htmlFor="obs-type-select" className="text-[10px] text-[var(--c-tx4)]">Type</Label>
          <select
            id="obs-type-select"
            value={newObstacleType}
            onChange={(e) => setNewObstacleType(e.target.value as ObstacleType)}
            className="w-full h-7 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-xs text-[var(--c-tx1)] px-2 font-mono"
          >
            <option value="WALL_SEGMENT">Wall Line Segment</option>
            <option value="OBSTACLE_POLYGON">Forbidden Interior Polygon</option>
          </select>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleAddObstacle}
          className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
        >
          <Plus size={13} />
          <span>Add Barrier</span>
        </Button>
      </div>

      {/* List of configured obstacles */}
      {obstacles.length === 0 ? (
        <div className="text-[11px] text-[var(--c-tx4)] italic text-center py-2">
          No interior wall barriers or forbidden zones configured yet.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {obstacles.map((obs) => {
            const isSelected = obs.id === selectedObstacleId;
            return (
              <div
                key={obs.id}
                className={`flex items-center justify-between rounded border transition-all ${obstacleRowClass(isSelected, obs.enabled)}`}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectObstacle?.(isSelected ? null : obs.id)}
                  className="flex flex-1 min-w-0 items-center gap-2 p-2 text-xs text-left cursor-pointer"
                >
                  <Layers size={13} className={obstacleIconClass(isSelected, obs.type)} />
                  <span>
                    <span className="font-semibold">{obs.name || 'Obstacle'}</span>
                    <span className="text-[10px] font-mono text-[var(--c-tx4)] ml-2">
                      [{obs.type === 'WALL_SEGMENT' ? 'Wall Line' : 'Forbidden Zone'}, {obs.points.length} Pts]
                    </span>
                    {isSelected && (
                      <span className="ml-2 px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/30 text-amber-600 dark:text-amber-300 border border-amber-400/40 uppercase">
                        Selected
                      </span>
                    )}
                  </span>
                </button>

                <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={(e) => handleToggleEnabled(obs.id, e)}
                    className="p-1 rounded hover:bg-[var(--c-bg5)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] transition-colors cursor-pointer"
                    title={obs.enabled ? 'Disable Barrier' : 'Enable Barrier'}
                  >
                    {obs.enabled ? <Eye size={13} className="text-emerald-400" /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteObstacle(obs.id, e)}
                    className="p-1 rounded hover:bg-red-500/20 text-[var(--c-tx3)] hover:text-red-400 transition-colors cursor-pointer"
                    title="Remove Barrier"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedObstacle && (
        <ObstacleVerticesEditor
          key={selectedObstacle.id}
          obstacle={selectedObstacle}
          axisLabels={axisLabels}
          axisLimits={axisLimits}
          onChange={(points) =>
            onChange(obstacles.map((obs) => (obs.id === selectedObstacle.id ? { ...obs, points } : obs)))
          }
        />
      )}
    </div>
  );
};

