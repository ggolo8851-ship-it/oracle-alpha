// Private equity / alternative asset universe — public proxies for PE exposure.

export type PESegment = "ALT_MANAGERS" | "BDCS" | "ETFS" | "SECONDARIES_HOLDCOS";

export const PE_UNIVERSE: Record<PESegment, { label: string; description: string; symbols: string[] }> = {
  ALT_MANAGERS: {
    label: "Alt-Asset Managers",
    description: "Listed private equity / credit / infra managers (BX, KKR, APO, ARES, etc.)",
    symbols: ["BX","KKR","APO","ARES","CG","OWL","TPG","BAM","BN","HLNE","STEP","PAX","PJT"],
  },
  BDCS: {
    label: "Business Development Companies",
    description: "Direct-lending BDCs — public proxies for private credit.",
    symbols: ["ARCC","MAIN","HTGC","OBDC","BXSL","FSK","GBDC","TSLX","PSEC","GSBD","TPVG","CSWC"],
  },
  ETFS: {
    label: "Listed PE ETFs",
    description: "Diversified listed-PE ETFs.",
    symbols: ["PSP","PEX","BIZD","PFFA"],
  },
  SECONDARIES_HOLDCOS: {
    label: "Holdcos & Secondaries",
    description: "PE-heavy holding companies and secondaries plays.",
    symbols: ["BN","ICE","CG","HLNE","STEP","GROY","BRX"],
  },
};

export const PE_ALL_SYMBOLS = Array.from(
  new Set(Object.values(PE_UNIVERSE).flatMap((g) => g.symbols)),
);
