import { vi } from 'vitest';

vi.mock('@/infrastructure/supabase/client', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

const mockSupabase = {
  auth: {
    signUp: mockSignUp,
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
    getUser: mockGetUser,
    updateUser: vi.fn(),
  },
  from: mockFrom,
};

import { authService } from '@/features/auth/services/auth-service';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    it('signs up user and returns mapped user', async () => {
      mockSignUp.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            user_metadata: { full_name: 'Test User' },
          },
        },
        error: null,
      });

      const result = await authService.signUp('test@example.com', 'password123', 'Test User', '');

      expect(result.user).not.toBeNull();
      expect(result.user?.email).toBe('test@example.com');
      expect(result.user?.fullName).toBe('Test User');
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: { data: { full_name: 'Test User', phone: '' } },
      });
    });

    it('returns error when sign up fails', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null },
        error: { message: 'Email already registered' },
      });

      const result = await authService.signUp('existing@example.com', 'password123', 'User');

      expect(result.user).toBeNull();
      expect(result.error).toBe('Email already registered');
    });
  });

  describe('signIn', () => {
    it('signs in user and returns mapped user', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            user_metadata: { full_name: 'Test User' },
          },
        },
        error: null,
      });

      const result = await authService.signIn('test@example.com', 'password123');

      expect(result.user).not.toBeNull();
      expect(result.user?.role).toBeNull();
    });

    it('returns error when sign in fails', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid credentials' },
      });

      const result = await authService.signIn('test@example.com', 'wrong');

      expect(result.user).toBeNull();
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('signOut', () => {
    it('signs out successfully', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const result = await authService.signOut();

      expect(result.error).toBeNull();
    });

    it('returns error on sign out failure', async () => {
      mockSignOut.mockResolvedValue({ error: { message: 'Session error' } });

      const result = await authService.signOut();

      expect(result.error).toBe('Session error');
    });
  });

  describe('getSession', () => {
    it('returns user from getUser', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            user_metadata: {},
          },
        },
      });

      const result = await authService.getSession();

      expect(result.user).not.toBeNull();
      expect(result.user?.id).toBe('user-1');
    });

    it('returns null user when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await authService.getSession();

      expect(result.user).toBeNull();
    });
  });

  describe('fetchProfile', () => {
    const mockSingle = vi.fn();
    const mockEq = vi.fn(() => ({ single: mockSingle }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));

    it('fetches profile by userId', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSingle.mockResolvedValue({
        data: {
          id: 'user-1',
          email: 'test@example.com',
          full_name: 'Test User',
          phone: null,
          avatar_url: null,
          role: 'student',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });

      const result = await authService.fetchProfile('user-1');

      expect(result.profile).not.toBeNull();
      expect(result.profile?.role).toBe('student');
      expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('returns error when profile not found', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Profile not found' },
      });

      const result = await authService.fetchProfile('nonexistent');

      expect(result.profile).toBeNull();
      expect(result.error).toBe('Profile not found');
    });

    it('calls select with explicit columns', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSingle.mockResolvedValue({ data: { id: 'user-1' }, error: null });

      await authService.fetchProfile('user-1');

      expect(mockSelect).toHaveBeenCalledWith(
        'id, email, full_name, phone, avatar_url, role, is_active, created_at, updated_at',
      );
    });
  });
});
