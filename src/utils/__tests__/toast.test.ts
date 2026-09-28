import { currentToast, dismissToast, showToast, subscribeToToasts, toastDuration } from '../toast';

describe('toast store', () => {
  it('shows the latest notice and tells subscribers', () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeToToasts((t) => seen.push(t?.title ?? null));
    showToast({ kind: 'info', title: 'One' });
    const id = showToast({ kind: 'error', title: 'Two' });
    expect(currentToast()?.title).toBe('Two');
    dismissToast(id);
    unsubscribe();
    expect(seen).toEqual(['One', 'Two', null]);
  });

  it('ignores dismissing a notice that has been replaced', () => {
    const first = showToast({ kind: 'info', title: 'First' });
    showToast({ kind: 'info', title: 'Second' });
    dismissToast(first);
    expect(currentToast()?.title).toBe('Second');
  });

  it('keeps errors and long messages up for longer', () => {
    expect(toastDuration({ kind: 'error' })).toBeGreaterThan(toastDuration({ kind: 'success' }));
    expect(toastDuration({ kind: 'info', message: 'x'.repeat(50) })).toBe(5000);
  });
});
