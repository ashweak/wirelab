import type { FloorKind } from "./parts";

export interface FloorMaterial {
  id: FloorKind;
  label: string;
  color: string;
  /** Tile or unit size (m) when the finish is laid in units. */
  unit?: [number, number];
  note: string;
}

export const FLOOR_MATERIALS: FloorMaterial[] = [
  { id: "tile", label: "Ceramic tile 30 × 30", color: "#d8d2c6", unit: [0.3, 0.3], note: "Glazed ceramic, kitchens and baths" },
  { id: "porcelain60", label: "Porcelain tile 60 × 60", color: "#e2ddd3", unit: [0.6, 0.6], note: "Large-format, living areas" },
  { id: "granite", label: "Granite tile 60 × 60", color: "#8d8a86", unit: [0.6, 0.6], note: "Hard-wearing, entrances and stairs" },
  { id: "marble", label: "Marble tile 60 × 60", color: "#ece9e2", unit: [0.6, 0.6], note: "Premium finish" },
  { id: "vinyl", label: "Vinyl plank", color: "#b8ab95", note: "Click-lock or glue-down, sold by m²" },
  { id: "wood", label: "Engineered wood planks", color: "#9a6b3f", note: "Sold by m²" },
  { id: "parquet", label: "Wood parquet", color: "#a8733f", note: "Narra/mahogany blocks, sold by m²" },
  { id: "concrete", label: "Polished concrete", color: "#8d9196", note: "Ground and sealed slab" },
  { id: "epoxy", label: "Epoxy coating", color: "#7f8b96", note: "Garages, utility, commercial" },
  { id: "carpet", label: "Carpet tile 50 × 50", color: "#5f6a78", unit: [0.5, 0.5], note: "Offices" },
];

