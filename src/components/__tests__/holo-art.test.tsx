/**
 * When the holo shimmer shows. It must never show, nor run the motion
 * sensor, with Reduce Motion on, on a screen out of focus, or with the
 * setting off.
 */
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, AppState, View } from 'react-native';

import { HoloArt } from '../holo-art';
import { SwitchRow } from '../list-row';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

const reduceMotion = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');

async function show(props: Partial<React.ComponentProps<typeof HoloArt>> = {}) {
  await render(
    <HoloArt look="holo" enabled borderRadius={12} {...props}>
      <View testID="art" style={{ width: 200, height: 280 }} />
    </HoloArt>,
  );
  // The shimmer is sized from the card's layout.
  await fireEvent(screen.getByTestId('holo-art'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 280 } },
  });
}

/**
 * Calls every listener added for `event` through one of React Native's own
 * Jest stand-ins, as the system would.
 */
function listeners(add: unknown, event: string, value: unknown) {
  for (const [name, listener] of (add as jest.Mock).mock.calls) {
    if (name === event) (listener as (value: unknown) => void)(value);
  }
}

/** Hidden from VoiceOver on purpose, so the query has to include hidden elements. */
const shimmer = () => screen.queryByTestId('holo-shimmer', { includeHiddenElements: true });

beforeEach(() => {
  mockFocused = true;
  reduceMotion.mockResolvedValue(false);
});

describe('HoloArt', () => {
  it('shimmers a holo card when the setting is on', async () => {
    await show();
    expect(shimmer()).not.toBeNull();
    expect(screen.getByTestId('art')).toBeOnTheScreen();
  });

  it('shows nothing with Reduce Motion on', async () => {
    reduceMotion.mockResolvedValue(true);
    await show();
    expect(shimmer()).toBeNull();
    expect(screen.getByTestId('art')).toBeOnTheScreen();
  });

  it('stops when Reduce Motion is turned on while it shows', async () => {
    await show();
    expect(shimmer()).not.toBeNull();
    await act(async () =>
      listeners(AccessibilityInfo.addEventListener, 'reduceMotionChanged', true),
    );
    expect(shimmer()).toBeNull();
  });

  it('shows nothing with the setting off, or for a card with no look', async () => {
    await show({ enabled: false });
    expect(shimmer()).toBeNull();
    await show({ look: null });
    expect(shimmer()).toBeNull();
  });

  it('stops while the screen is not focused', async () => {
    mockFocused = false;
    await show();
    expect(shimmer()).toBeNull();
  });

  it('stops while the app is in the background', async () => {
    await show();
    expect(shimmer()).not.toBeNull();
    await act(async () => listeners(AppState.addEventListener, 'change', 'background'));
    expect(shimmer()).toBeNull();
    await act(async () => listeners(AppState.addEventListener, 'change', 'active'));
    expect(shimmer()).not.toBeNull();
  });

  it('is hidden from VoiceOver: decoration, not content', async () => {
    await show();
    expect(shimmer()).toHaveProp('accessibilityElementsHidden', true);
  });
});

describe('SwitchRow', () => {
  function Holo({ disabled }: { disabled?: boolean }) {
    const [on, setOn] = useState(false);
    return <SwitchRow title="Holo shimmer" value={on} onChange={setOn} disabled={disabled} />;
  }

  it('is one switch, named, that flips when tapped', async () => {
    await render(<Holo />);
    const row = screen.getByRole('switch', { name: 'Holo shimmer' });
    expect(row).not.toBeChecked();
    await userEvent.press(row);
    expect(screen.getByRole('switch', { name: 'Holo shimmer' })).toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('does nothing while disabled, and says so', async () => {
    await render(<Holo disabled />);
    const row = screen.getByRole('switch', { name: 'Holo shimmer' });
    expect(row).toBeDisabled();
    await userEvent.press(row);
    expect(screen.getByRole('switch', { name: 'Holo shimmer' })).not.toBeChecked();
  });
});
