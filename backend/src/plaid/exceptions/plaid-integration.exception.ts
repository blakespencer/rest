import { HttpException, HttpStatus } from '@nestjs/common';

export class PlaidIntegrationException extends HttpException {
  constructor(
    message: string,
    public readonly originalError?: any,
  ) {
    const errorResponse = {
      statusCode: HttpStatus.BAD_GATEWAY,
      message,
      error: 'PlaidIntegrationError',
      errorCode: originalError?.response?.data?.error_code,
      errorType: originalError?.response?.data?.error_type,
      displayMessage: originalError?.response?.data?.display_message,
    };

    super(errorResponse, HttpStatus.BAD_GATEWAY);
  }
}
