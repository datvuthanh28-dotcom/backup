// Common Vietnamese retail and foreign bank options used for customer refunds.
// Keep the stable short code as the stored value and show the legal name to customers.
export const VIETNAM_BANKS = [
  ["VCB", "Vietcombank"], ["BIDV", "BIDV"], ["CTG", "VietinBank"], ["AGR", "Agribank"],
  ["TCB", "Techcombank"], ["ACB", "ACB"], ["MBB", "MB Bank"], ["VPB", "VPBank"],
  ["STB", "Sacombank"], ["HDB", "HDBank"], ["SHB", "SHB"], ["VIB", "VIB"],
  ["TPB", "TPBank"], ["EIB", "Eximbank"], ["MSB", "MSB"], ["SSB", "SeABank"],
  ["OCB", "OCB"], ["LPB", "LPBank"], ["NAB", "Nam A Bank"], ["VAB", "VietABank"],
  ["VBB", "VietBank"], ["ABB", "ABBank"], ["BAB", "Bac A Bank"], ["BVB", "BVBank"],
  ["BVBV", "BaoViet Bank"], ["PVC", "PVcomBank"], ["KLB", "KienlongBank"], ["NCB", "NCB"],
  ["SGB", "Saigonbank"], ["PGB", "PGBank"], ["CBB", "CBBank"], ["OJB", "OceanBank"],
  ["GPB", "GPBank"], ["DAB", "DongA Bank"], ["PBVN", "Public Bank Vietnam"],
  ["CIMB", "CIMB Vietnam"], ["HLBVN", "Hong Leong Vietnam"], ["UOB", "UOB Vietnam"],
  ["SCB", "Standard Chartered Vietnam"], ["HSBC", "HSBC Vietnam"], ["SHBVN", "Shinhan Bank Vietnam"],
  ["WVB", "Woori Bank Vietnam"], ["ANZ", "ANZ Vietnam"], ["CITI", "Citibank Vietnam"],
];

export const VIETNAM_BANK_MAP = Object.fromEntries(VIETNAM_BANKS);
