import { LoggerInterface } from '../types';
import { AxiosError } from 'axios';

// Default logger implementation
export class ConsoleLogger implements LoggerInterface {
  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    // Check if the first argument is an AxiosError
    if (args.length > 0 && args[0] instanceof AxiosError) {
      const error = args[0] as AxiosError;
      console.error(message, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        responseData: error.response?.data,
        requestData: error.config?.data,
      }, ...args.slice(1));
    } else {
      console.error(message, ...args);
    }
  }
} 