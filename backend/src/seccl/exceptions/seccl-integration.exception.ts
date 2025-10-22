import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception thrown when Seccl API integration fails
 */
export class SecclIntegrationException extends HttpException {
  constructor(
    message: string,
    public readonly originalError?: any,
  ) {
    const errorResponse = {
      statusCode: HttpStatus.BAD_GATEWAY,
      message,
      error: 'SecclIntegrationError',
      errorCode: originalError?.response?.data?.errorCode,
      secclRequestId: originalError?.response?.headers?.[
        'x-seccl-request-id'
      ],
    };

    super(errorResponse, HttpStatus.BAD_GATEWAY);
  }
}
