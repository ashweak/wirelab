export const CIRCUIT_COLORS: Record<string, string> = {
  C1: "#f5b942",
  C2: "#38bdf8",
  C3: "#4ade80",
  C4: "#a78bfa",
  C5: "#fb7185",
  C6: "#f472b6",
};

export const colorFor = (id: string) => CIRCUIT_COLORS[id] ?? "#e2e8f0";
