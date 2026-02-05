/**
 * Errores estandarizados para la aplicación
 */

export class WhatsAppConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppConnectionError';
    Object.setPrototypeOf(this, WhatsAppConnectionError.prototype);
  }
}

export class WhatsAppRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppRateLimitError';
    Object.setPrototypeOf(this, WhatsAppRateLimitError.prototype);
  }
}

export class WhatsAppCircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppCircuitBreakerError';
    Object.setPrototypeOf(this, WhatsAppCircuitBreakerError.prototype);
  }
}

export class FileSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSizeError';
    Object.setPrototypeOf(this, FileSizeError.prototype);
  }
}

export class DatabaseTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseTimeoutError';
    Object.setPrototypeOf(this, DatabaseTimeoutError.prototype);
  }
}

export class JobExecutionError extends Error {
  constructor(message: string, public readonly jobId?: number) {
    super(message);
    this.name = 'JobExecutionError';
    Object.setPrototypeOf(this, JobExecutionError.prototype);
  }
}

export class TemplateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateNotFoundError';
    Object.setPrototypeOf(this, TemplateNotFoundError.prototype);
  }
}
