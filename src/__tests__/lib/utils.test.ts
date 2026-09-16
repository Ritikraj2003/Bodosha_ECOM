import { cn, formatCurrency, slugify } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-4', 'py-2')).toContain('px-4');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toContain('visible');
  });
});

describe('formatCurrency', () => {
  it('formats in Indian Rupees', () => {
    expect(formatCurrency(0)).toContain('0');
  });

  it('formats positive amounts', () => {
    const result = formatCurrency(250);
    expect(result).toContain('250');
  });

  it('formats large amounts', () => {
    const result = formatCurrency(100000);
    expect(result).toContain('1,00,000');
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world foo')).toBe('hello-world-foo');
  });

  it('removes special characters', () => {
    expect(slugify('hello! world?')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});
