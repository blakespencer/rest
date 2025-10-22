import { User } from '@prisma/client';
import { AuthResponseDto } from '../dto/auth-response.dto';

export class UserMapper {
  static toAuthResponseDto(user: User): Omit<AuthResponseDto, 'accessToken'> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
