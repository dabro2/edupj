export type ToolType = 'select' | 'text' | 'image' | 'rotate';

export interface TextElement {
  id: string;
  type: 'text';
  pageIndex: number;
  x: number;
  y: number;
  content: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  width?: number;
  height?: number;
}

export interface ImageElement {
  id: string;
  type: 'image';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageData: string;
  originalWidth: number;
  originalHeight: number;
}

export type PdfElement = TextElement | ImageElement;

export interface OriginalTextItem {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  fontSize: number;
  _changed?: boolean;
}

export interface PageInfo {
  id: string;
  width: number;
  height: number;
  rotation: number;
  thumbnail?: string;
  originalIndex?: number;
  isNewPage?: boolean;
}
