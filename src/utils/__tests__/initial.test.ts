import { initialOf } from '../initial';

describe('initialOf', () => {
  it('upper-cases the first letter', () => {
    expect(initialOf('trainer')).toBe('T');
  });

  it('ignores leading spaces', () => {
    expect(initialOf('  misty')).toBe('M');
  });

  it('keeps a character outside the basic plane whole', () => {
    expect(initialOf('🔥blaze')).toBe('🔥');
  });

  it('falls back when there is no name', () => {
    expect(initialOf('')).toBe('?');
    expect(initialOf(undefined)).toBe('?');
  });
});
