import { ActionSheetIOS } from 'react-native';

/**
 * A native iOS action sheet for a one-off choice. Resolves to the chosen
 * index into `options`, or null if cancelled. `destructive` marks options,
 * by index, drawn in red. iOS only, like the app.
 */
export function pick(
  title: string,
  options: readonly string[],
  { destructive = [] }: { destructive?: number[] } = {},
): Promise<number | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options, 'Cancel'],
        cancelButtonIndex: options.length,
        ...(destructive.length ? { destructiveButtonIndex: destructive } : {}),
      },
      (index) => resolve(index === options.length ? null : index),
    );
  });
}
