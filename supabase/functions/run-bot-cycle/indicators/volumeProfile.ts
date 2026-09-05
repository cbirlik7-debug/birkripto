// Volume Profile - POC, VAH, VAL hesaplama
export interface VolumeProfileResult {
  poc: number;   // Point of Control
  vah: number;   // Value Area High
  val: number;   // Value Area Low
  position: 'above_poc' | 'below_poc' | 'at_poc';
}

export function getVolumeProfileSignal(
  highs: number[], lows: number[], closes: number[], volumes: number[], bins: number
): VolumeProfileResult | null {
  if (highs.length < 10) return null;
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const binSize = (maxPrice - minPrice) / bins;
  if (binSize === 0) return null;

  const profile: number[] = new Array(bins).fill(0);
  for (let i = 0; i < closes.length; i++) {
    const binIdx = Math.min(Math.floor((closes[i] - minPrice) / binSize), bins - 1);
    profile[binIdx] += volumes[i];
  }

  const pocIdx = profile.indexOf(Math.max(...profile));
  const poc = minPrice + pocIdx * binSize + binSize / 2;
  const totalVolume = profile.reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;

  let accVol = profile[pocIdx];
  let lo = pocIdx, hi = pocIdx;
  while (accVol < targetVolume && (lo > 0 || hi < bins - 1)) {
    const addLow = lo > 0 ? profile[lo - 1] : 0;
    const addHigh = hi < bins - 1 ? profile[hi + 1] : 0;
    if (addLow >= addHigh && lo > 0) { lo--; accVol += profile[lo]; }
    else if (hi < bins - 1) { hi++; accVol += profile[hi]; }
    else break;
  }

  const val = minPrice + lo * binSize;
  const vah = minPrice + (hi + 1) * binSize;
  const lastClose = closes[closes.length - 1];
  return {
    poc, val, vah,
    position: lastClose > poc ? 'above_poc' : lastClose < poc ? 'below_poc' : 'at_poc',
  };
}
