export interface VolumeData {
  high: number;
  low: number;
  volume: number;
}

export interface VolumeProfile {
  poc: number; // Point of Control
  vah: number; // Value Area High
  val: number; // Value Area Low
}

export function calculateVolumeProfile(data: VolumeData[], numBins: number = 24): VolumeProfile {
  if (data.length === 0) return { poc: 0, vah: 0, val: 0 };
  
  let minPrice = data[0].low;
  let maxPrice = data[0].high;
  
  for (const d of data) {
    if (d.low < minPrice) minPrice = d.low;
    if (d.high > maxPrice) maxPrice = d.high;
  }
  
  // Prevent division by zero if all prices are the same
  if (maxPrice === minPrice) {
      return { poc: maxPrice, vah: maxPrice, val: minPrice };
  }
  
  const binSize = (maxPrice - minPrice) / numBins;
  const bins = new Array(numBins).fill(0);
  
  for (const d of data) {
    for (let i = 0; i < numBins; i++) {
      const binBottom = minPrice + i * binSize;
      const binTop = minPrice + (i + 1) * binSize;
      
      // If candle overlaps with bin
      if (d.high >= binBottom && d.low <= binTop) {
         // Simplification: assign volume to overlapping bins (could be distributed proportionally)
         bins[i] += d.volume; 
      }
    }
  }
  
  let maxVol = 0;
  let pocIndex = 0;
  let totalVol = 0;
  
  for (let i = 0; i < numBins; i++) {
    totalVol += bins[i];
    if (bins[i] > maxVol) {
      maxVol = bins[i];
      pocIndex = i;
    }
  }
  
  const pocPrice = minPrice + (pocIndex + 0.5) * binSize;
  
  // Value Area (70% of volume)
  const valueAreaTarget = totalVol * 0.7;
  let valueAreaVol = maxVol;
  let upperIndex = pocIndex;
  let lowerIndex = pocIndex;
  
  while (valueAreaVol < valueAreaTarget && (upperIndex < numBins - 1 || lowerIndex > 0)) {
    const nextUpperVol = upperIndex < numBins - 1 ? bins[upperIndex + 1] : -1;
    const nextLowerVol = lowerIndex > 0 ? bins[lowerIndex - 1] : -1;
    
    if (nextUpperVol >= nextLowerVol && nextUpperVol !== -1) {
      upperIndex++;
      valueAreaVol += nextUpperVol;
    } else if (nextLowerVol !== -1) {
      lowerIndex--;
      valueAreaVol += nextLowerVol;
    }
  }
  
  return {
    poc: pocPrice,
    vah: minPrice + (upperIndex + 1) * binSize,
    val: minPrice + lowerIndex * binSize
  };
}
