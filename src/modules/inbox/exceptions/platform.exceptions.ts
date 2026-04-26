export class PlatformAuthException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'PlatformAuthException';
  }
}

export class PlatformTokenExpiredException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'PlatformTokenExpiredException';
  }
}

export class PlatformNotSupportedException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'PlatformNotSupportedException';
  }
}
