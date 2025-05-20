
"use client";

import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from './DataTable';
import type { ColumnDefinition } from '@/types';
import { FileDown, Download, Loader2 } from 'lucide-react'; 
import { generatePdf } from '@/lib/pdfGenerator'; 
import { useState } from 'react';

interface SectionCardProps<T extends object> {
  title: string;
  data?: T[]; // Optional if children are provided for content
  columns?: ColumnDefinition<T>[]; // Optional if children are provided for content
  viewId: string; 
  isLoading: boolean;
  children?: React.ReactNode; // To allow custom content rendering
  onPdfDownload?: () => void; // Optional custom PDF download handler
}

export function SectionCard<T extends object>({ 
  title, 
  data, 
  columns, 
  viewId, 
  isLoading, 
  children,
  onPdfDownload 
}: SectionCardProps<T>) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = () => {
    if (onPdfDownload) {
      onPdfDownload();
      return;
    }

    if (!data || data.length === 0 || !columns) {
      alert("No data available to download or columns not configured.");
      return;
    }
    setIsDownloading(true);
    try {
      generatePdf(title, columns, data, `${viewId}_report.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const canDownload = onPdfDownload ? true : (data && data.length > 0 && columns);

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-2xl text-primary">{title}</CardTitle>
        <Button 
          onClick={handleDownloadPdf} 
          variant="outline" 
          size="sm"
          disabled={isLoading || isDownloading || !canDownload}
          aria-label={`Download ${title} as PDF`}
        >
          {isDownloading ? (
            <Download className="mr-2 h-4 w-4 animate-pulse" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          PDF
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p>Loading data...</p>
          </div>
        ) : children ? (
          children // Render custom children if provided
        ) : data && columns ? (
          <DataTable columns={columns} data={data} />
        ) : (
           <p className="text-muted-foreground p-4 text-center">No data available to display.</p>
        )}
      </CardContent>
      {!isLoading && !children && data && data.length > 0 && ( // Show footer only if not using custom children and data exists
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Displaying {data.length} {data.length === 1 ? 'entry' : 'entries'}.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
