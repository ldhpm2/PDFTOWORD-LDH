import * as pdfjsLib from 'pdfjs-dist';

// Use a fixed stable version for both library and worker
const PDFJS_VERSION = '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

export const loadPdf = async (file: File): Promise<pdfjsLib.PDFDocumentProxy> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Basic check for PDF magic number (%PDF-)
    if (data[0] !== 0x25 || data[1] !== 0x50 || data[2] !== 0x44 || data[3] !== 0x46) {
      throw new Error("Tệp không phải là định dạng PDF hợp lệ (thiếu mã nhận diện %PDF-).");
    }

    const loadingTask = pdfjsLib.getDocument({ 
      data: data,
      // Use matching version for CMaps
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/cmaps/`,
      cMapPacked: true,
      // Disable range requests to avoid issues with some servers/proxies
      disableRange: true,
      disableAutoFetch: true,
    });
    
    return await loadingTask.promise;
  } catch (error: any) {
    console.error("PDF Load Error:", error);
    if (error.name === 'PasswordException') {
      throw new Error("Tệp PDF này được bảo vệ bằng mật khẩu. Vui lòng gỡ bỏ mật khẩu trước khi chuyển đổi.");
    } else if (error.name === 'InvalidPDFException') {
      throw new Error("Cấu trúc tệp PDF không hợp lệ hoặc tệp đã bị hỏng.");
    }
    throw new Error(`Không thể đọc tệp PDF: ${error.message || 'Lỗi không xác định'}`);
  }
};

export const renderPageToCanvas = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number = 1.5 
): Promise<HTMLCanvasElement> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Cannot create canvas context');

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  // In newer versions of pdfjs-dist, providing the canvas element explicitly 
  // can help resolve some internal caching issues.
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  await (page as any).render(renderContext).promise;

  return canvas;
};

export const cropImageFromCanvas = (
  sourceCanvas: HTMLCanvasElement,
  box_2d: [number, number, number, number]
): string => {
  let [ymin, xmin, ymax, xmax] = box_2d;

  // ADD PADDING LOGIC
  // Add 25 units (on 1000 scale) padding to each side (~2.5%)
  // This ensures labels, axis numbers, or arrowheads near the edge are captured.
  const PADDING = 15; 

  ymin = Math.max(0, ymin - PADDING);
  xmin = Math.max(0, xmin - PADDING);
  ymax = Math.min(1000, ymax + PADDING);
  xmax = Math.min(1000, xmax + PADDING);

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // Convert 0-1000 scale to pixels
  const top = (ymin / 1000) * height;
  const left = (xmin / 1000) * width;
  const cropHeight = ((ymax - ymin) / 1000) * height;
  const cropWidth = ((xmax - xmin) / 1000) * width;

  // Safety check
  if (cropWidth <= 0 || cropHeight <= 0) return '';

  const destCanvas = document.createElement('canvas');
  destCanvas.width = cropWidth;
  destCanvas.height = cropHeight;
  const ctx = destCanvas.getContext('2d');
  
  if (!ctx) return '';

  // Draw with high quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    sourceCanvas,
    left, top, cropWidth, cropHeight, // Source
    0, 0, cropWidth, cropHeight // Destination
  );

  return destCanvas.toDataURL('image/png'); // Return base64
};