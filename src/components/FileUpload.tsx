
"use client";

import type React from 'react';
import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2, FileText } from 'lucide-react';
import { Label } from './ui/label';

interface FileUploadProps {
  onFileUpload: (file: File) => Promise<void>;
  isLoading: boolean;
}

export function FileUpload({ onFileUpload, isLoading }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (event.target) {
          event.target.value = ''; // Reset file input
        }
      }
    } else {
      setSelectedFile(null);
      setFileName('');
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

  const handleChooseFileClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-card rounded-lg shadow">
      <div className="space-y-2">
        <Label htmlFor="file-upload-button" className="text-lg font-medium">Upload Diet Plan</Label>
        
        <Input
          id="file-upload-input"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileChange}
          className="hidden" // Hide the actual file input
          ref={fileInputRef}
          aria-describedby="file-upload-help"
        />
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            id="file-upload-button"
            type="button" // Important: prevent form submission
            onClick={handleChooseFileClick}
            variant="default" 
            className="shrink-0"
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            Choose File
          </Button>
          <div className="flex items-center text-sm text-muted-foreground border border-input rounded-md px-3 py-2 min-h-[2.5rem] flex-grow break-all">
            {fileName ? (
              <>
                <FileText className="mr-2 h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{fileName}</span>
              </>
            ) : (
              "No file chosen"
            )}
          </div>
        </div>
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
