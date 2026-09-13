export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
};
