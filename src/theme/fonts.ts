/**
 * Loads the app's fonts at runtime from the JavaScript bundle, so adding or
 * changing one needs no native build. Only the weights `fonts` names are
 * imported, one file each, to keep the bundle small.
 */
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { SpaceGrotesk_400Regular } from '@expo-google-fonts/space-grotesk/400Regular';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';

import { fonts } from './index';

/**
 * True once the fonts are ready, or have failed to load. A failure falls
 * back to the system font rather than holding the app on the splash screen.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [fonts.regular]: SpaceGrotesk_400Regular,
    [fonts.medium]: SpaceGrotesk_500Medium,
    [fonts.semibold]: SpaceGrotesk_600SemiBold,
    [fonts.bold]: SpaceGrotesk_700Bold,
    [fonts.mono]: JetBrainsMono_500Medium,
    [fonts.monoBold]: JetBrainsMono_700Bold,
  });
  return loaded || error !== null;
}
