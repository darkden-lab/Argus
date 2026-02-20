import { useToastStore, toast } from '@/stores/toast';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('addToast', () => {
    it('adds a toast with generated id', () => {
      useToastStore.getState().addToast({
        title: 'Success',
        variant: 'success',
      });

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].title).toBe('Success');
      expect(toasts[0].variant).toBe('success');
      expect(toasts[0].id).toBeDefined();
    });

    it('adds toast with description', () => {
      useToastStore.getState().addToast({
        title: 'Error occurred',
        description: 'Something went wrong',
        variant: 'error',
      });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].description).toBe('Something went wrong');
    });

    it('auto-removes toast after 5 seconds', () => {
      useToastStore.getState().addToast({
        title: 'Temporary',
        variant: 'default',
      });

      expect(useToastStore.getState().toasts).toHaveLength(1);

      jest.advanceTimersByTime(5000);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('supports multiple toasts', () => {
      useToastStore.getState().addToast({ title: 'First', variant: 'default' });
      useToastStore.getState().addToast({ title: 'Second', variant: 'success' });
      useToastStore.getState().addToast({ title: 'Third', variant: 'error' });

      expect(useToastStore.getState().toasts).toHaveLength(3);
    });

    it('generates unique ids for each toast', () => {
      useToastStore.getState().addToast({ title: 'A', variant: 'default' });
      useToastStore.getState().addToast({ title: 'B', variant: 'default' });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].id).not.toBe(toasts[1].id);
    });
  });

  describe('removeToast', () => {
    it('removes a specific toast by id', () => {
      useToastStore.getState().addToast({ title: 'Keep', variant: 'default' });
      useToastStore.getState().addToast({ title: 'Remove', variant: 'error' });

      const toasts = useToastStore.getState().toasts;
      const removeId = toasts[1].id;

      useToastStore.getState().removeToast(removeId);

      const remaining = useToastStore.getState().toasts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe('Keep');
    });

    it('does nothing if id does not exist', () => {
      useToastStore.getState().addToast({ title: 'Test', variant: 'default' });

      useToastStore.getState().removeToast('nonexistent');

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe('toast() helper function', () => {
    it('adds a toast with default variant', () => {
      toast('Hello');

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].title).toBe('Hello');
      expect(toasts[0].variant).toBe('default');
    });

    it('adds a toast with custom options', () => {
      toast('Error', { description: 'Details', variant: 'error' });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].title).toBe('Error');
      expect(toasts[0].description).toBe('Details');
      expect(toasts[0].variant).toBe('error');
    });

    it('adds a toast with description only', () => {
      toast('Warning', { description: 'Be careful' });

      const toasts = useToastStore.getState().toasts;
      expect(toasts[0].variant).toBe('default');
      expect(toasts[0].description).toBe('Be careful');
    });
  });
});
