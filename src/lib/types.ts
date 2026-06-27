export type RawDye = {
  id: string;
  name: string;
  category: string;
  rgb: { r: number; g: number; b: number };
  tags?: string[];
  lodestone?: string;
  source?: string;
};

export type Dye = RawDye & {
  hex: string;
  lab: [number, number, number];
};

export type RawDyeFile = { dyes: RawDye[] };
