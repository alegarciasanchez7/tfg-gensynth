import React, { useState } from 'react';
import { BoundaryObstacle, ObstacleType, Point3DCoord } from '../../../../types';
import { Plus, Trash2, ShieldAlert, Eye, EyeOff, Layers } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

interface BoundaryObstaclesEditorProps {
  obstacles: BoundaryObstacle[];
  selectedObstacleId?: string | null;
  onSelectObstacle?: (id: string | null) => void;
  onChange: (newObstacles: BoundaryObstacle[]) => void;
}

export const BoundaryObstaclesEditor: React.FC<BoundaryObstaclesEditorProps> = ({
  obstacles = [],
  selectedObstacleId,
  onSelectObstacle,
  onChange,
}) => {
  const [newObstacleName, setNewObstacleName] = useState<string>('');
  const [newObstacleType, setNewObstacleType] = useState<ObstacleType>('WALL_SEGMENT');

  const handleAddObstacle = () => {
    const name = newObstacleName.trim() || (newObstacleType === 'WALL_SEGMENT' ? 'Wall Barrier' : 'Forbidden Zone');
    const defaultPoints: Point3DCoord[] =
      newObstacleType === 'WALL_SEGMENT'
        ? [
            { x: -20, y: 0, z: 0 },
            { x: 20, y: 0, z: 0 },
          ]
        : [
            { x: -15, y: -15, z: 0 },
            { x: 15, y: -15, z: 0 },
            { x: 15, y: 15, z: 0 },
            { x: -15, y: 15, z: 0 },
          ];

    const newObs: BoundaryObstacle = {
      id: `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
          <span>2D Walls & Forbidden Interior Obstacle Zones ({obstacles.length})</span>
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

        <div className="w-[140px] space-y-1">
          <Label className="text-[10px] text-[var(--c-tx4)]">Type</Label>
          <select
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
                onClick={() => onSelectObstacle?.(isSelected ? null : obs.id)}
                className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400/40 text-amber-200 shadow-sm'
                    : obs.enabled
                    ? 'border-amber-500/30 bg-amber-500/5 text-[var(--c-tx2)] hover:border-amber-400/50'
                    : 'border-[var(--c-br1)] bg-[var(--c-bg2)] text-[var(--c-tx4)] opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <Layers size={13} className={isSelected ? 'text-amber-300' : (obs.type === 'WALL_SEGMENT' ? 'text-red-400' : 'text-amber-400')} />
                  <div>
                    <span className="font-semibold">{obs.name || 'Obstacle'}</span>
                    <span className="text-[10px] font-mono text-[var(--c-tx4)] ml-2">
                      [{obs.type === 'WALL_SEGMENT' ? 'Wall Line' : 'Forbidden Zone'}, {obs.points.length} Pts]
                    </span>
                    {isSelected && (
                      <span className="ml-2 px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/30 text-amber-300 border border-amber-400/40 uppercase">
                        Selected
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => handleToggleEnabled(obs.id, e)}
                    className="p-1 rounded hover:bg-white/10 text-[var(--c-tx3)] hover:text-white transition-colors cursor-pointer"
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
    </div>
  );
};

