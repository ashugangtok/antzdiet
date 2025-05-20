"use client";

import type React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ColumnDefinition } from '@/types';

interface DataTableProps<T extends object> {
  columns: ColumnDefinition<T>[];
  data: T[];
  caption?: string;
}

export function DataTable<T extends object>({ columns, data, caption }: DataTableProps<T>) {
  if (!data || data.length === 0) {
    return <p className="text-muted-foreground p-4 text-center">No data available to display.</p>;
  }

  return (
    <ScrollArea className="h-[400px] w-full rounded-md border shadow-sm">
      <Table>
        {caption && <TableCaption>{caption}</TableCaption>}
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className="font-semibold">
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {columns.map((column) => (
                <TableCell key={`${String(column.key)}-${rowIndex}`}>
                  {column.cell ? column.cell(row) : String(row[column.key as keyof T] ?? '')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
