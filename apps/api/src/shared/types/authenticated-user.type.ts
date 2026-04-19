export type AuthenticatedUser = {
  id: string;
  email: string | null;
  role: string | null;
  token: string;
};

