export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image'
}

export interface ProcessingStatus {
  total: number;
  current: number;
  message: string;
  isProcessing: boolean;
  error?: string;
}

export interface GeminiContentBlock {
  type: ContentType;
  content?: string;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 scale
}

export interface ProcessedPage {
  pageNumber: number;
  blocks: ProcessedBlock[];
}

export interface ProcessedBlock {
  type: ContentType;
  text?: string;
  imageData?: string; // Base64
  width?: number;
  height?: number;
}
