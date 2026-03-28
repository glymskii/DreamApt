export interface User {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
