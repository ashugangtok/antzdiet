"use client";

import type React from 'react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2 } from 'lucide-react';
import { Label } from './ui/label';

interface FileUploadProps {
  onFileUpload: (file: File) => Promise<void>;
  isLoading: boolean;
}

export function FileUpload({ onFileUpload, isLoading }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')) {
        setSelectedFile(file);
        setFileName(file.name);
      } else {
        alert('Invalid file type. Please upload an .xlsx file.');
        setSelectedFile(null);
        setFileName('');
        event.target.value = ''; // Reset file input
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedFile) {
      await onFileUpload(selectedFile);
    } else {
      alert('Please select a file first.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-card rounded-lg shadow">
      <div className="space-y-2">
        <Label htmlFor="file-upload" className="text-lg font-medium">Upload Diet Plan</Label>
        <div className="flex items-center space-x-2">
          <Input
            id="file-upload"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
            className="flex-grow file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            aria-describedby="file-upload-help"
          />
        </div>
        {fileName && <p className="text-sm text-muted-foreground">Selected file: {fileName}</p>}
        <p id="file-upload-help" className="text-xs text-muted-foreground">
          Please upload an Excel file (.xlsx) with the diet plan.
        </p>
      </div>
      <Button type="submit" disabled={isLoading || !selectedFile} className="w-full sm:w-auto">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <UploadCloud className="mr-2 h-4 w-4" />
            Upload and Process
          </>
        )}
      </Button>
    </form>
  );
}
