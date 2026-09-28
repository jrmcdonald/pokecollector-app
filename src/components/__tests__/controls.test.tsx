/**
 * Accessibility of the shared controls, tested the way VoiceOver finds them:
 * by role and accessible name, with their state. A control that loses its
 * label or role fails here.
 */
import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { Button } from '../button';
import { Chips } from '../chips';
import { ProgressBar } from '../progress-bar';
import { QuantityStepper } from '../quantity-stepper';
import { SearchField } from '../search-field';
import { Segmented } from '../segmented';
import { TextField } from '../text-field';
import { ThemedText } from '../themed-text';

describe('ThemedText', () => {
  it('marks titles and section headings as headings, for the VoiceOver rotor', async () => {
    await render(
      <>
        <ThemedText variant="title">Pikachu</ThemedText>
        <ThemedText variant="heading">Add copies</ThemedText>
        <ThemedText variant="overline">Trend</ThemedText>
        <ThemedText>Body</ThemedText>
      </>,
    );
    expect(screen.getByRole('header', { name: 'Pikachu' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Add copies' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Trend' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Body' })).not.toBeOnTheScreen();
  });
});

describe('Segmented', () => {
  function Show() {
    const [value, setValue] = useState<'all' | 'missing'>('all');
    return (
      <Segmented<'all' | 'missing'>
        label="Show"
        options={[
          { value: 'all', label: 'All' },
          { value: 'missing', label: 'Missing' },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it('reads each segment with its position, and moves the selection', async () => {
    await render(<Show />);
    expect(screen.getByRole('radio', { name: 'All, 1 of 2' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Missing, 2 of 2' }));
    expect(screen.getByRole('radio', { name: 'Missing, 2 of 2' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'All, 1 of 2' })).not.toBeSelected();
  });
});

describe('Button', () => {
  it('is a button named by its title', async () => {
    const onPress = jest.fn();
    await render(<Button title="Add 1 to collection" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Add 1 to collection' });
    await userEvent.setup().press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says it is disabled', async () => {
    await render(<Button title="Save" disabled onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps its name while busy, when the title is replaced by a spinner', async () => {
    await render(<Button title="Test and save" busy onPress={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Test and save' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });
});

describe('QuantityStepper', () => {
  function Stepper({ min = 0 }: { min?: number }) {
    const [value, setValue] = useState(1);
    return <QuantityStepper label="Holo NM" value={value} onChange={setValue} min={min} />;
  }

  it('names both buttons after what they change', async () => {
    await render(<Stepper />);
    expect(screen.getByRole('button', { name: 'Increase Holo NM' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove one of Holo NM' })).toBeEnabled();
  });

  it('disables the button at its limit', async () => {
    await render(<Stepper min={1} />);
    expect(screen.getByRole('button', { name: 'Decrease Holo NM' })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Increase Holo NM' }));
    expect(screen.getByRole('button', { name: 'Decrease Holo NM' })).toBeEnabled();
  });
});

describe('Chips', () => {
  function Conditions() {
    const [value, setValue] = useState<'NM' | 'LP'>('NM');
    return (
      <Chips<'NM' | 'LP'>
        label="Condition"
        options={[
          { value: 'NM', label: 'NM' },
          { value: 'LP', label: 'LP' },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it('is a set of radios whose selection moves when a chip is pressed', async () => {
    await render(<Conditions />);
    expect(screen.getByRole('radio', { name: 'NM' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'LP' }));
    expect(screen.getByRole('radio', { name: 'LP' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'NM' })).not.toBeSelected();
  });
});

describe('fields', () => {
  it('labels a text field with its visible label', async () => {
    await render(<TextField label="PokeCollector username" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('PokeCollector username')).toBeOnTheScreen();
  });

  it('gives the search field a name and a named clear button', async () => {
    const onChangeText = jest.fn();
    await render(
      <SearchField
        value="pika"
        onChangeText={onChangeText}
        placeholder="Name, set, number or artist"
        accessibilityLabel="Search your collection"
      />,
    );
    expect(screen.getByLabelText('Search your collection')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

describe('ProgressBar', () => {
  it('reports its value as a percentage', async () => {
    await render(<ProgressBar value={0.25} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 25 });
  });
});
