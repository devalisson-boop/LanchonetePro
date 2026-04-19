import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

type PgError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
};

type NormalizedException = {
  status: number;
  message: string;
  code?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<{
      method: string;
      url: string;
      body?: unknown;
    }>();
    const response = context.getResponse<{
      status: (code: number) => {
        json: (payload: Record<string, unknown>) => void;
      };
    }>();

    const normalized = this.normalizeException(exception);
    const logMessage = `${request.method} ${request.url} -> ${normalized.status} ${normalized.message}`;

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logMessage);
    }

    response.status(normalized.status).json({
      statusCode: normalized.status,
      message: normalized.message,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(normalized.code ? { code: normalized.code } : {}),
    });
  }

  private normalizeException(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: this.extractHttpExceptionMessage(exception),
      };
    }

    if (this.isPgError(exception)) {
      return this.normalizePgError(exception);
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: this.isDevelopment()
          ? exception.message
          : 'Falha interna no servidor.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Falha interna no servidor.',
    };
  }

  private extractHttpExceptionMessage(exception: HttpException) {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const payload = response as { message?: string | string[] };

      if (Array.isArray(payload.message)) {
        return payload.message.join(', ');
      }

      if (typeof payload.message === 'string') {
        return payload.message;
      }
    }

    return exception.message;
  }

  private normalizePgError(error: PgError): NormalizedException {
    const detail = this.isDevelopment() && error.detail ? ` Detalhe: ${error.detail}` : '';

    switch (error.code) {
      case '23503':
        return {
          status: HttpStatus.CONFLICT,
          code: error.code,
          message: `Nao foi possivel concluir a operacao porque um registro relacionado nao existe.${detail}`.trim(),
        };
      case '23505':
        return {
          status: HttpStatus.CONFLICT,
          code: error.code,
          message: `Ja existe um registro com os mesmos dados unicos.${detail}`.trim(),
        };
      case '23514':
      case '22P02':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: error.code,
          message: `Os dados enviados sao invalidos para esta operacao.${detail}`.trim(),
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: error.code,
          message: this.isDevelopment() && error.message
            ? error.message
            : 'Falha interna ao acessar o banco de dados.',
        };
    }
  }

  private isPgError(exception: unknown): exception is PgError {
    return Boolean(
      exception
      && typeof exception === 'object'
      && 'code' in exception,
    );
  }

  private isDevelopment() {
    return process.env.NODE_ENV !== 'production';
  }
}
