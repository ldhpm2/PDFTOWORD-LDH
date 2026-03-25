import React, { useState, useEffect } from 'react';
import { UploadArea } from './components/UploadArea';
import { loadPdf, renderPageToCanvas, cropImageFromCanvas } from './services/pdfService';
import { analyzePageContent, validateApiKey } from './services/geminiService';
import { generateAndSaveWordDoc } from './services/wordService';
import { ProcessingStatus, ProcessedPage, ProcessedBlock, ContentType } from './types';
import { FileText, CheckCircle2, Loader2, AlertTriangle, Sparkles, ArrowRight, Layers, Image as ImageIcon, Cpu } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>({
    total: 0,
    current: 0,
    message: '',
    isProcessing: false
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [apiKeys, setApiKeys] = useState<string[]>(['']);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [processedPages, setProcessedPages] = useState<ProcessedPage[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const savedKeys = localStorage.getItem('gemini_api_keys');
    if (savedKeys) {
      try {
        const parsed = JSON.parse(savedKeys);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setApiKeys(parsed);
        }
      } catch (e) {
        // Fallback for old single key format
        const oldKey = localStorage.getItem('gemini_api_key');
        if (oldKey) {
          setApiKeys([oldKey]);
        }
      }
    } else {
      // Fallback for old single key format
      const oldKey = localStorage.getItem('gemini_api_key');
      if (oldKey) {
        setApiKeys([oldKey]);
      }
    }
  }, []);

  const handleApiKeyChange = (index: number, value: string) => {
    const newKeys = [...apiKeys];
    newKeys[index] = value;
    setApiKeys(newKeys);
    localStorage.setItem('gemini_api_keys', JSON.stringify(newKeys));
    if (status.error) {
      setStatus(prev => ({ ...prev, error: undefined }));
    }
  };

  const addApiKey = () => {
    if (apiKeys.length < 10) {
      setApiKeys([...apiKeys, '']);
    }
  };

  const removeApiKey = (index: number) => {
    if (apiKeys.length > 1) {
      const newKeys = apiKeys.filter((_, i) => i !== index);
      setApiKeys(newKeys);
      localStorage.setItem('gemini_api_keys', JSON.stringify(newKeys));
    }
  };

  const handleFileSelect = (file: File) => {
    setPdfFile(file);
    setStatus({
      total: 0,
      current: 0,
      message: 'Sẵn sàng',
      isProcessing: false
    });
    setProcessedPages([]);
    setCurrentStep(1);
  };

  const steps = [
    { id: 1, name: 'Upload', icon: FileText },
    { id: 2, name: 'AI Analysis', icon: Cpu },
    { id: 3, name: 'Extraction', icon: Layers },
    { id: 4, name: 'Done', icon: CheckCircle2 },
  ];

  const startConversion = async () => {
    if (!pdfFile) return;
    
    const validKeys = apiKeys.filter(k => k.trim().length >= 10);
    if (validKeys.length === 0) {
        setStatus(prev => ({ ...prev, error: "Vui lòng nhập ít nhất một Gemini API Key hợp lệ để bắt đầu." }));
        setShowApiKeyInput(true);
        return;
    }

    try {
      setStatus({
        total: 0,
        current: 0,
        message: 'Đang kiểm tra API Keys...',
        isProcessing: true,
        error: undefined
      });

      // Validate first API Key as a representative check
      await validateApiKey(validKeys[0]);

      setCurrentStep(2);
      setStatus({
        total: 0,
        current: 0,
        message: 'Đang khởi động...',
        isProcessing: true
      });

      const pdfDoc = await loadPdf(pdfFile);
      const totalPages = pdfDoc.numPages;
      const pagesData: ProcessedPage[] = [];

      setStatus(prev => ({ ...prev, total: totalPages, message: 'Đang đọc tài liệu...' }));

      for (let i = 1; i <= totalPages; i++) {
        setStatus(prev => ({ 
          ...prev, 
          current: i, 
          message: `Đang phân tích trang ${i}/${totalPages}...` 
        }));

        // 1. Render page to image
        const canvas = await renderPageToCanvas(pdfDoc, i, 2.0);
        const pageImageBase64 = canvas.toDataURL('image/png');

        // 2. Send to Gemini with retry logic for multiple keys
        let analysisBlocks = null;
        let lastError = null;
        
        // Try each valid key until one works
        for (let keyIndex = 0; keyIndex < validKeys.length; keyIndex++) {
          // Start with a rotated key but allow trying others if it fails
          const rotatedIndex = (i - 1 + keyIndex) % validKeys.length;
          const currentKey = validKeys[rotatedIndex];
          
          try {
            analysisBlocks = await analyzePageContent(pageImageBase64, currentKey);
            if (analysisBlocks) break; // Success!
          } catch (err: any) {
            console.warn(`Key ${rotatedIndex + 1} failed, trying next...`, err);
            lastError = err;
            // If we have more keys, continue to the next one
            if (keyIndex < validKeys.length - 1) {
              setStatus(prev => ({ 
                ...prev, 
                message: `Key ${(rotatedIndex % validKeys.length) + 1} lỗi, đang thử Key ${((rotatedIndex + 1) % validKeys.length) + 1}...` 
              }));
              continue;
            }
          }
        }

        if (!analysisBlocks) {
          throw lastError || new Error("Tất cả API Keys đều thất bại hoặc hết lượt dùng.");
        }

        // 3. Process Blocks (Crop images if needed)
        setCurrentStep(3); 
        const processedBlocks: ProcessedBlock[] = analysisBlocks.map(block => {
          if (block.type === ContentType.IMAGE && block.box_2d) {
            const croppedBase64 = cropImageFromCanvas(canvas, block.box_2d);
            
            // Calculate dimensions for Word
            // We need to calculate how big this should appear in Word (points/pixels)
            // independent of the high-res scan scale.
            const [ymin, xmin, ymax, xmax] = block.box_2d;
            
            // Assume PDF page width is roughly 595pt (A4).
            // The crop percentage width * 595 gives us roughly the point width in Word.
            const widthPercentage = (xmax - xmin) / 1000;
            const heightPercentage = (ymax - ymin) / 1000;
            
            // 600px is roughly full width in docx text area
            const targetPageWidth = 600; 
            
            let finalWidth = widthPercentage * targetPageWidth;
            let finalHeight = heightPercentage * (targetPageWidth * (canvas.height / canvas.width));

            // Add a slight multiplier because we added padding in the crop function
            // This prevents the image from looking "shrunken" due to the extra white space
            finalWidth = finalWidth * 1.05;
            finalHeight = finalHeight * 1.05;

            // Cap max width
            const MAX_WIDTH = 550;
            if (finalWidth > MAX_WIDTH) {
              const ratio = MAX_WIDTH / finalWidth;
              finalWidth = MAX_WIDTH;
              finalHeight = finalHeight * ratio;
            }

            return {
              type: ContentType.IMAGE,
              imageData: croppedBase64,
              width: finalWidth, 
              height: finalHeight
            };
          }
          return {
            type: ContentType.TEXT,
            text: block.content
          };
        });

        pagesData.push({
          pageNumber: i,
          blocks: processedBlocks
        });
      }

      setProcessedPages(pagesData);
      setStatus(prev => ({ ...prev, message: 'Đang tổng hợp file Word...', current: totalPages }));
      
      await generateAndSaveWordDoc(pagesData, pdfFile.name);

      setCurrentStep(4);
      setStatus({
        total: totalPages,
        current: totalPages,
        message: 'Hoàn tất! Đã tải xuống.',
        isProcessing: false
      });

    } catch (error: any) {
      console.error(error);
      let errorMessage = 'Đã xảy ra lỗi. Vui lòng thử lại.';
      
      if (error.message) {
        if (error.message.includes('API_KEY_INVALID')) {
          errorMessage = 'API Key không hợp lệ. Vui lòng kiểm tra lại.';
        } else if (error.message.includes('model not found')) {
          errorMessage = 'Không tìm thấy mô hình AI. Vui lòng thử lại sau.';
        } else {
          errorMessage = error.message;
        }
      }

      setStatus(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage
      }));
      setCurrentStep(1);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center relative">
      
      {/* Header */}
      <div className="text-center mb-12 space-y-4 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-600 text-xs font-bold uppercase tracking-wider mb-4">
          <Sparkles className="w-3 h-3" />
          <span>PDF TO WORD TẠO BỞI LƯƠNG ĐÌNH HÙNG ZALO 0986.282.414</span>
        </div>
        <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Chuyển đổi PDF sang <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-400">Word</span>
        </h1>
        <p className="text-lg text-slate-600 font-light">
          Giữ nguyên định dạng, tự động tách và chèn ảnh thông minh vào đúng vị trí câu hỏi.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-3xl glass-card rounded-[2rem] shadow-2xl shadow-brand-200/50 overflow-hidden p-1 sm:p-2">
        
        {/* API Key Input Section */}
        <div className="px-6 pt-6 sm:px-10">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-600" />
              Gemini API Keys ({apiKeys.filter(k => k.trim().length > 0).length}/10)
            </label>
            <button 
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              {showApiKeyInput ? 'Ẩn' : 'Thay đổi'}
            </button>
          </div>
          
          {showApiKeyInput && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-300 mb-4">
              {apiKeys.map((key, index) => (
                <div key={index} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => handleApiKeyChange(index, e.target.value)}
                      placeholder={`API Key ${index + 1}...`}
                      className={`w-full px-4 py-2 rounded-xl border bg-white/50 outline-none transition-all text-sm font-mono
                        ${status.error && !key && index === 0 ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500'}
                      `}
                    />
                  </div>
                  {apiKeys.length > 1 && (
                    <button 
                      onClick={() => removeApiKey(index)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      title="Xóa key này"
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              
              {apiKeys.length < 10 && (
                <button 
                  onClick={addApiKey}
                  className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-brand-300 hover:text-brand-600 transition-all"
                >
                  + Thêm API Key mới
                </button>
              )}

              <p className="text-[10px] text-slate-400">
                Key được lưu cục bộ trên trình duyệt của bạn. Lấy key tại <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Google AI Studio</a>.
              </p>
            </div>
          )}
          
          {!showApiKeyInput && apiKeys.some(k => k.trim().length > 0) && (
            <div className="text-xs text-slate-400 flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>{apiKeys.filter(k => k.trim().length > 0).length} API Key đã sẵn sàng</span>
            </div>
          )}
        </div>

        <div className="bg-white/50 rounded-[1.8rem] p-6 sm:p-10 border border-white/50">
          
          {/* Step Indicator */}
          <div className="mb-10">
            <div className="flex justify-between relative">
              {/* Line */}
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -z-10 -translate-y-1/2 rounded-full"></div>
              <div 
                className="absolute top-1/2 left-0 h-0.5 bg-brand-600 -z-10 -translate-y-1/2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
              ></div>

              {steps.map((step) => {
                const isActive = currentStep >= step.id;
                const isCurrent = currentStep === step.id;
                const Icon = step.icon;
                return (
                  <div key={step.id} className="flex flex-col items-center gap-2 bg-white px-2">
                    <div 
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                        ${isActive ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-200' : 'bg-white border-slate-200 text-slate-400'}
                        ${isCurrent ? 'ring-4 ring-brand-100 scale-110' : ''}
                      `}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-semibold transition-colors duration-300 ${isActive ? 'text-brand-700' : 'text-slate-400'}`}>
                      {step.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="space-y-8 min-h-[300px]">
            
            {/* Upload State */}
            {(!pdfFile || (status.message === 'Hoàn tất! Đã tải xuống.' && !status.isProcessing)) && (
               <div className="animate-in fade-in zoom-in duration-300">
                 <UploadArea onFileSelect={handleFileSelect} disabled={status.isProcessing} />
               </div>
            )}

            {/* File Selected / Processing State */}
            {pdfFile && status.message !== 'Hoàn tất! Đã tải xuống.' && (
              <div className="animate-in slide-in-from-bottom-4 duration-500">
                {/* File Info Card */}
                <div className="flex items-center justify-between bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-6 group hover:border-brand-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                      <FileText className="text-red-500 w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{pdfFile.name}</h3>
                      <p className="text-sm text-slate-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  {!status.isProcessing && (
                     <button 
                     onClick={() => { setPdfFile(null); setCurrentStep(0); }}
                     className="text-sm font-medium text-slate-400 hover:text-red-500 transition-colors px-3 py-2"
                   >
                     Hủy
                   </button>
                  )}
                </div>

                {/* Actions / Status */}
                {!status.isProcessing ? (
                  <div className="text-center">
                    <button
                      onClick={startConversion}
                      className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 py-4 px-8 rounded-xl text-lg font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-xl shadow-brand-200 transition-all transform hover:-translate-y-1 active:translate-y-0 focus:ring-4 focus:ring-brand-100"
                    >
                      <span>Bắt đầu xử lý</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <p className="mt-4 text-sm text-slate-400">
                      Sẽ mất khoảng 5-10s cho mỗi trang tài liệu.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 text-center py-4">
                    <div className="relative mx-auto w-20 h-20">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-brand-600 rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-brand-600">
                          {Math.round((status.current / (status.total || 1)) * 100)}%
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800 animate-pulse">
                        {status.message}
                      </h3>
                      <p className="text-slate-500 text-sm mt-1">
                        Vui lòng không tắt trình duyệt
                      </p>
                    </div>

                    {/* Detail Log */}
                    <div className="max-w-xs mx-auto mt-4 flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-50 py-2 px-4 rounded-full">
                      <Cpu className="w-3 h-3" />
                      <span>AI Processing Active</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Success State */}
            {!status.isProcessing && status.message === 'Hoàn tất! Đã tải xuống.' && (
               <div className="text-center animate-in zoom-in duration-500 py-4">
                 <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-100">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                 </div>
                 <h3 className="text-2xl font-bold text-slate-800 mb-2">Chuyển đổi thành công!</h3>
                 <p className="text-slate-500 mb-8 max-w-md mx-auto">
                   File Word đã tự động tải xuống. Hình ảnh đã được cắt và đặt đúng vị trí.
                 </p>
                 
                 <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => {
                        setPdfFile(null);
                        setProcessedPages([]);
                        setStatus({ total: 0, current: 0, message: '', isProcessing: false });
                        setCurrentStep(1);
                      }}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                    >
                      <Sparkles className="w-4 h-4" />
                      Làm file khác
                    </button>
                 </div>
               </div>
            )}

            {/* Error State */}
            {status.error && (
               <div className="flex items-center gap-4 bg-red-50 p-6 rounded-xl border border-red-100 text-red-800 animate-in shake">
                 <div className="p-3 bg-white rounded-full shadow-sm">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                 </div>
                 <div>
                   <h4 className="font-bold text-lg">Đã có lỗi xảy ra</h4>
                   <p className="text-red-600/80">{status.error}</p>
                 </div>
               </div>
            )}

          </div>
        </div>

        {/* Footer in Card */}
        <div className="bg-slate-50/80 p-4 text-center border-t border-slate-100 backdrop-blur-sm">
           <div className="flex justify-center gap-6 text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Smart Crop</span>
              <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Layout Preservation</span>
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> Gemini 2.5 AI</span>
           </div>
        </div>
      </div>
      
      <p className="mt-8 text-slate-400 text-sm font-medium opacity-60">
        &copy; 2024 PDF2Word AI Converter
      </p>

    </div>
  );
};

export default App;