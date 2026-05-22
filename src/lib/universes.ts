// Curated symbol universes by region / sector / cap.
// All public Yahoo-listed tickers. Used by scanners, news, and global hubs.

export const MICRO_SMALL_MID = [
  // Small/mid caps frequently exhibiting anomalies
  "SOFI","PLTR","RKLB","ASTS","ACHR","JOBY","IONQ","RGTI","QBTS","SOUN",
  "BBAI","TEM","SYM","AI","PATH","SMR","OKLO","NNE","VST","CEG",
  "MARA","RIOT","CLSK","WULF","BITF","HUT","CIFR","HIVE",
  "BTBT","CORZ","APLD","NBIS","CRWV","PSTG","DOCN","FROG",
  "U","RBLX","ROKU","ETSY","CHWY","CVNA","AFRM","UPST","HOOD",
  "DKNG","PENN","FUBO","SPCE","LCID","RIVN","NIO","XPEV","LI",
  // Biotech runners
  "VKTX","SMMT","CRSP","NTLA","EDIT","BEAM","RCKT","SAVA","AXSM","MDGL","VRDN",
  // Defense / cyber
  "KTOS","AVAV","RKLB","LMT","RTX","NOC","PLTR","CRWD","ZS","S","NET","FTNT","OKTA",
  // Semis / supply chain
  "AMD","NVDA","SMCI","ARM","MRVL","MU","ASML","TSM","KLAC","LRCX","ONTO","ACLS","ACMR","ICHR",
  // Energy transition
  "ENPH","FSLR","NEE","RUN","ARRY","SHLS","CHPT","BLNK","PLUG","STEM","NOVA",
  // Logistics / infra
  "GBX","WAB","KEX","MATX","ZIM","XPO","CHRW","ODFL",
];

export const MEGACAPS = [
  "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","BRK-B","JPM",
  "V","UNH","XOM","WMT","MA","LLY","JNJ","COST","HD","PG","ABBV","BAC","ORCL","NFLX","ADBE","CRM",
];

export const REGIONS: Record<string, { label: string; flag: string; symbols: string[]; index: string }> = {
  us: {
    label: "United States",
    flag: "🇺🇸",
    index: "^GSPC",
    symbols: ["^GSPC","^IXIC","^DJI","^RUT","^VIX","^TNX","AAPL","MSFT","NVDA","JPM","XOM","LMT","UNH","TSLA"],
  },
  china: {
    label: "China / HK",
    flag: "🇨🇳",
    index: "000001.SS",
    symbols: ["000001.SS","399001.SZ","^HSI","BABA","JD","PDD","BIDU","NIO","XPEV","LI","TCEHY","BYDDY","NTES","TME"],
  },
  japan: {
    label: "Japan",
    flag: "🇯🇵",
    index: "^N225",
    symbols: ["^N225","JPY=X","7203.T","6758.T","9984.T","8035.T","6861.T","6594.T","TM","SONY"],
  },
  korea: {
    label: "South Korea",
    flag: "🇰🇷",
    index: "^KS11",
    symbols: ["^KS11","KRW=X","005930.KS","000660.KS","051910.KS","207940.KS","035420.KS"],
  },
  india: {
    label: "India",
    flag: "🇮🇳",
    index: "^NSEI",
    symbols: ["^NSEI","^BSESN","INR=X","RELIANCE.NS","TCS.NS","INFY","HDFCBANK.NS","ICICIBANK.NS","BHARTIARTL.NS"],
  },
  europe: {
    label: "Europe",
    flag: "🇪🇺",
    index: "^STOXX50E",
    symbols: ["^STOXX50E","^GDAXI","^FCHI","^FTSE","EURUSD=X","ASML","SAP","MC.PA","RMS.PA","NESN.SW","NOVN.SW","SHEL","HSBC","ULVR.L"],
  },
  latam: {
    label: "Latin America",
    flag: "🇧🇷",
    index: "^BVSP",
    symbols: ["^BVSP","BRL=X","MXN=X","VALE","PBR","ITUB","BBD","NU","MELI"],
  },
  africa: {
    label: "Africa / MEA",
    flag: "🌍",
    index: "^JN0U.JO",
    symbols: ["^JN0U.JO","ZAR=X","NGNUSD=X","MTNOY","SBSW","GFI","HMY","AGL.JO"],
  },
};

export const SECTORS: Record<string, { label: string; symbols: string[] }> = {
  technology: {
    label: "Technology",
    symbols: ["AAPL","MSFT","GOOGL","META","NVDA","AVGO","ORCL","CRM","ADBE","AMD","ARM","SMCI","PLTR","SNOW","CRWD","ZS","NET","FTNT"],
  },
  semiconductors: {
    label: "Semiconductors",
    symbols: ["NVDA","AMD","AVGO","ASML","TSM","MU","ARM","SMCI","LRCX","KLAC","MRVL","ONTO","QCOM","INTC"],
  },
  ai: {
    label: "AI Pure-Plays",
    symbols: ["NVDA","PLTR","AI","TEM","RGTI","IONQ","QBTS","SOUN","BBAI","SYM","PATH","NBIS","CRWV","APLD"],
  },
  cybersecurity: {
    label: "Cybersecurity",
    symbols: ["CRWD","PANW","ZS","FTNT","S","NET","OKTA","CYBR","TENB","RBRK"],
  },
  finance: {
    label: "Finance",
    symbols: ["JPM","BAC","WFC","GS","MS","C","V","MA","AXP","SCHW","BLK","PYPL","SQ"],
  },
  energy: {
    label: "Energy",
    symbols: ["XOM","CVX","COP","OXY","SLB","EOG","PSX","MPC","VLO","CL=F","NG=F"],
  },
  nuclear_renewables: {
    label: "Nuclear & Renewables",
    symbols: ["CEG","VST","SMR","OKLO","NNE","ENPH","FSLR","NEE","RUN","SHLS","ARRY","PLUG","STEM"],
  },
  healthcare: {
    label: "Healthcare",
    symbols: ["LLY","UNH","JNJ","NVO","ABBV","MRK","PFE","ABT","TMO","DHR","ISRG","REGN","VRTX"],
  },
  biotech: {
    label: "Biotech Runners",
    symbols: ["VKTX","SMMT","CRSP","NTLA","BEAM","EDIT","AXSM","MDGL","VRDN","RCKT","SAVA","MRNA","BNTX"],
  },
  consumer: {
    label: "Consumer",
    symbols: ["AMZN","WMT","COST","HD","NKE","SBUX","MCD","TGT","LULU","DIS","NFLX","CMG"],
  },
  industrial: {
    label: "Industrial / Defense",
    symbols: ["LMT","RTX","NOC","GD","BA","CAT","DE","HON","GE","UNP","UPS","FDX","XPO","ZIM"],
  },
  crypto: {
    label: "Crypto Complex",
    symbols: ["BTC-USD","ETH-USD","SOL-USD","COIN","MSTR","MARA","RIOT","CLSK","HOOD","CORZ","WULF"],
  },
  commodities: {
    label: "Commodities",
    symbols: ["GC=F","SI=F","CL=F","NG=F","HG=F","ZW=F","ZC=F","ZS=F","KC=F","CC=F"],
  },
};
