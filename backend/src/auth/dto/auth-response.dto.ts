export class AuthResponseDto {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  accessToken: string;
}
