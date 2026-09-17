export type Role = 'student' | 'merchant' | 'delivery' | 'admin' | 'super_admin' | 'owner' | 'staff' | 'manager' | string;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role | null;
  avatarUrl: string | null;
  phone: string | null;
  permissions?: string[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface AuthResponse {
  user: AuthUser | null;
  error: string | null;
}

export interface SessionState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
