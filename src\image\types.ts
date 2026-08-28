export type FidelityStatus = 'not-applicable' | 'pending' | 'preserved' | 'blocked' | 'failed';

export type ProductExtractionMethod = 'existing-alpha' | 'edge-flood-fill';

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductCutout {
  b64_json: string;
  width: number;
  height: number;
  bounds: PixelBounds;
  confidence: number;
  method: ProductExtractionMethod;
  warnings: string[];
}

export interface CompositeResult {
  b64_json: string;
  width: number;
  height: number;
  productBounds: PixelBounds;
  fidelityStatus: 'preserved';
  warnings: string[];
}

export interface TextOverlayConfig {
  brandName?: string;
  brandEnglish?: string;
  heritageLine?: string;
  headline?: string;
  subHeadline?: string;
  sellingPoints?: string[];
  footerText?: string;
}

export interface TextOverlayResult {
  b64_json: string;
  width: number;
  height: number;
  textBounds: {
    brand?: { x: number; y: number; width: number; height: number };
    headline?: { x: number; y: number; width: number; height: number };
    sellingPoints?: { x: number; y: number; width: number; height: number };
  };
}


