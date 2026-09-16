import { describe, it, expect } from 'vitest';
import { useCamera } from '@/hooks/useCamera';

describe('useCamera Hook', () => {
  it('should be defined as a function', () => {
    expect(useCamera).toBeDefined();
    expect(typeof useCamera).toBe('function');
  });
});
