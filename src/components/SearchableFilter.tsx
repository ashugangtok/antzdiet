import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SearchableFilterProps {
  options: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder?: string;
}

export function SearchableFilter({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "Search..."
}: SearchableFilterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);

  useEffect(() => {
    const filtered = options.filter(option =>
      option.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredOptions(filtered);
  }, [searchQuery, options]);

  const handleToggle = (value: string) => {
    const newSelection = selectedValues.includes(value)
      ? selectedValues.filter(item => item !== value)
      : [...selectedValues, value];
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedValues.length === filteredOptions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...filteredOptions]);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-2"
      />
      <div className="flex items-center gap-2 mb-2">
        <Checkbox
          id="select-all"
          checked={selectedValues.length === filteredOptions.length && filteredOptions.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <Label htmlFor="select-all">Select All</Label>
      </div>
      <ScrollArea className="h-[200px] rounded-md border p-2">
        <div className="space-y-2">
          {filteredOptions.map((option) => (
            <div key={option} className="flex items-center gap-2">
              <Checkbox
                id={option}
                checked={selectedValues.includes(option)}
                onCheckedChange={() => handleToggle(option)}
              />
              <Label htmlFor={option} className="truncate">
                {option}
              </Label>
            </div>
          ))}
          {filteredOptions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No matches found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}