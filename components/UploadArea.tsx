import React, { useCallback, useState } from 'react';
import { UploadCloud, FileType, FileText, Sparkles } from 'lucide-react';

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

export const UploadArea: React.FC<UploadAreaProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Vui lòng chỉ tải lên file PDF.');
      }
    }
  }, [onFileSelect, disabled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative group w-full mx-auto p-10 border-2 border-dashed rounded-3xl transition-all duration-300 ease-out text-center overflow-hidden
        ${disabled 
          ? 'border-slate-200 bg-slate-50/50 cursor-not-allowed opacity-60' 
          : isDragging
            ? 'border-brand-500 bg-brand-50/50 scale-[1.01] shadow-lg ring-4 ring-brand-50'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50 cursor-pointer hover:shadow-md'
        }`}
    >
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        id="file-upload"
        onChange={handleInputChange}
        disabled={disabled}
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center relative z-10">
        <div className={`p-5 rounded-2xl mb-5 transition-transform duration-300 group-hover:-translate-y-1 ${disabled ? 'bg-slate-100 text-slate-400' : 'bg-brand-600 text-white shadow-brand-200 shadow-xl'}`}>
          {isDragging ? (
            <Sparkles className="w-8 h-8 animate-pulse" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>
        
        <h3 className="text-xl font-bold text-slate-800 mb-2">
          {isDragging ? 'Thả file vào đây' : 'Tải lên đề thi PDF'}
        </h3>
        
        <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
          Kéo thả file PDF hoặc click để chọn file từ thiết bị của bạn
        </p>

        <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wide border border-slate-200">
          <FileType className="w-3 h-3" />
          <span>PDF Format Only</span>
        </div>
      </label>

      {/* Decorative Background Blobs */}
      {!disabled && (
        <>
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-100 rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-3xl"></div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-100 rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-3xl"></div>
        </>
      )}
    </div>
  );
};