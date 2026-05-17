import React from 'react';
import { ListVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { Trash2, Plus } from 'lucide-react';

interface ListConfigPanelProps {
  config: ListVariableConfig;
  onChange: (newConfig: Partial<ListVariableConfig>) => void;
}

export const ListConfigPanel: React.FC<ListConfigPanelProps> = ({ config, onChange }) => {
  const items = config.items || [];

  const handleAddItem = () => {
    onChange({ items: [...items, { value: '', weight: 1.0 }] });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    onChange({ items: newItems });
  };

  const handleItemChange = (index: number, field: 'value' | 'weight', newValue: string) => {
    const newItems = [...items];
    const currentItem = newItems[index];
    
    // Convert to object if it's a primitive
    if (typeof currentItem !== 'object' || currentItem === null) {
      newItems[index] = { value: currentItem, weight: 1.0 };
    }

    if (field === 'weight') {
      newItems[index][field] = parseFloat(newValue) || 0;
    } else {
      newItems[index][field] = newValue;
    }
    onChange({ items: newItems });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label>List Items & Weights</Label>
          <Button variant="outline" size="sm" onClick={handleAddItem}>
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>
        
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No items added yet. Click 'Add Item' to start.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto p-1">
            {items.map((item, idx) => {
              const val = typeof item === 'object' && item !== null ? item.value : item;
              const weight = typeof item === 'object' && item !== null && item.weight !== undefined ? item.weight : 1.0;
              
              return (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    className="flex-1"
                    placeholder="Value"
                    value={val}
                    onChange={(e) => handleItemChange(idx, 'value', e.target.value)}
                  />
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Weight"
                      value={weight}
                      onChange={(e) => handleItemChange(idx, 'weight', e.target.value)}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
