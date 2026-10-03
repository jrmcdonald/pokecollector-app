/**
 * The Scan tab's last mode, so someone looking cards up in a shop stays in
 * look-up mode between visits to the tab. Not a secret, so AsyncStorage,
 * which the query cache already uses; a failure only means the tab opens in
 * its default mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ScanMode = 'single' | 'batch' | 'lookup';

const KEY = 'pokecollector.scan-mode';
const MODES: readonly string[] = ['single', 'batch', 'lookup'] satisfies ScanMode[];

function isScanMode(value: string | null): value is ScanMode {
  return value !== null && MODES.includes(value);
}

export async function loadScanMode(): Promise<ScanMode | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return isScanMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveScanMode(mode: ScanMode): void {
  AsyncStorage.setItem(KEY, mode).catch(() => undefined);
}
