export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
  DEBUG = "DEBUG",
}

export enum ErrorSource {
  INFRASTRUCTURE = "INFRASTRUCTURE",
  BACKEND_LOGIC = "BACKEND_LOGIC",
  VALIDATION = "VALIDATION",
  BUSINESS_RULE = "BUSINESS_RULE",
  UNKNOWN = "UNKNOWN",
}

class Logger {
  public info(message: string, context?: any) {
    console.log(`\x1b[32m[INFO]\x1b[0m ${message}`, context || "");
  }

  public warn(message: string, context?: any) {
    console.log(`\x1b[33m[WARN]\x1b[0m ${message}`, context || "");
  }

  public error(message: string, source: ErrorSource, context?: any) {
    console.log(`\x1b[31m[ERROR][${source}]\x1b[0m ${message}`, context || "");
  }

  public debug(message: string, context?: any) {
    console.log(`\x1b[36m[DEBUG]\x1b[0m ${message}`, context || "");
  }
}

export const logger = new Logger();
