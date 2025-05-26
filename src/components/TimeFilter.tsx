import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TimeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function TimeFilter({ value, onChange }: TimeFilterProps) {
  const timeRanges = [
    { id: 'all', label: 'All Day', value: null },
    { id: 'early', label: 'Before 6 AM', value: '00:00-06:00' },
    { id: 'morning', label: '6 AM to 12 PM', value: '06:00-12:00' },
    { id: 'afternoon', label: '12 PM to 6 PM', value: '12:00-18:00' },
    { id: 'evening', label: 'After 6 PM', value: '18:00-23:59' }
  ];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select time range" />
      </SelectTrigger>
      <SelectContent>
        {timeRanges.map((range) => (
          <SelectItem key={range.id} value={range.id}>
            {range.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}