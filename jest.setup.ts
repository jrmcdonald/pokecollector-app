/**
 * Stand-ins for native views that have no JavaScript rendering, so component
 * tests can render screens that use them.
 */

// SF Symbols are drawn natively; in tests an icon is a plain view carrying
// the same accessibility props, so tests still see what VoiceOver would.
jest.mock('expo-symbols', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: View };
});

// Reanimated's and Worklets' own stand-ins: animated views are plain views,
// styles are computed once, and sensors report nothing.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
