import { renderHook, waitFor, act } from '@testing-library/react';
import { useApiQuery } from '@/hooks/use-api-query';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

import { api } from '@/lib/api';

const mockGet = api.get as jest.Mock;

describe('useApiQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches data on mount and returns it', async () => {
    mockGet.mockResolvedValueOnce({ items: [1, 2, 3] });

    const { result } = renderHook(() =>
      useApiQuery<{ items: number[] }>('/api/pods')
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({ items: [1, 2, 3] });
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/pods');
  });

  it('sets error when the API call fails with an Error', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() =>
      useApiQuery<unknown>('/api/failing')
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network failure');
  });

  it('sets "Unknown error" when the API call fails with a non-Error', async () => {
    mockGet.mockRejectedValueOnce('something went wrong');

    const { result } = renderHook(() =>
      useApiQuery<unknown>('/api/failing')
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Unknown error');
  });

  it('does not fetch when path is null', async () => {
    const { result } = renderHook(() => useApiQuery<unknown>(null));

    // Should not be loading since path is null
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('refetch triggers a new API call', async () => {
    mockGet
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    const { result } = renderHook(() =>
      useApiQuery<{ count: number }>('/api/counter')
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ count: 1 });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({ count: 2 })
    );

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('re-fetches when the path changes', async () => {
    mockGet
      .mockResolvedValueOnce({ name: 'pods' })
      .mockResolvedValueOnce({ name: 'services' });

    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useApiQuery<{ name: string }>(path),
      { initialProps: { path: '/api/pods' } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ name: 'pods' });

    rerender({ path: '/api/services' });

    await waitFor(() =>
      expect(result.current.data).toEqual({ name: 'services' })
    );

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/pods');
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/services');
  });

  it('clears previous error on refetch success', async () => {
    mockGet
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useApiQuery<{ ok: boolean }>('/api/retry')
    );

    await waitFor(() => expect(result.current.error).toBe('Temporary failure'));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({ ok: true });
  });

  it('sets isLoading to true during refetch', async () => {
    let resolvePromise: (value: unknown) => void;
    mockGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const { result } = renderHook(() =>
      useApiQuery<unknown>('/api/slow')
    );

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({ done: true });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ done: true });
  });
});
