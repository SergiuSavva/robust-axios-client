import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { RobustAxiosClient } from './RobustAxiosClient';
import { RobustAxiosConfig } from '../types';

/**
 * Factory class for creating and managing RobustAxios instances
 */
export class RobustAxiosFactory {
  // Static reference to default instance for testing/cleanup
  private static _defaultInstance: RobustAxiosClient | null = null;

  /**
   * Creates a new instance of RobustAxiosClient with the provided configuration.
   * 
   * @param {RobustAxiosConfig} config - Configuration options for RobustAxiosClient
   * @returns {RobustAxiosClient} A new RobustAxiosClient instance
   * 
   * @example
   * ```typescript
   * // Create with default settings
   * const api = RobustAxios.create({
   *   baseURL: 'https://api.example.com'
   * });
   * 
   * // Create with retry settings
   * const api = RobustAxios.create({
   *   baseURL: 'https://api.example.com',
   *   retry: {
   *     maxRetries: 3,
   *     backoffStrategy: 'exponential'
   *   }
   * });
   * ```
   */
  public static create(config: RobustAxiosConfig): RobustAxiosClient {
    return new RobustAxiosClient(config);
  }

  // Method to reset all static instances for testing
  public static _resetForTesting(): void {
    if (RobustAxiosFactory._defaultInstance) {
      RobustAxiosFactory._defaultInstance.destroy();
      RobustAxiosFactory._defaultInstance = null;
    }
  }

  // Get default instance, create if doesn't exist
  public static getDefaultInstance(): RobustAxiosClient {
    if (!RobustAxiosFactory._defaultInstance) {
      RobustAxiosFactory._defaultInstance = new RobustAxiosClient({ baseURL: '' });
    }
    return RobustAxiosFactory._defaultInstance;
  }

  // Static methods that delegate to the default instance
  public static request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().request<T>(config);
  }

  public static get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().get<T>(url, config);
  }

  public static delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().delete<T>(url, config);
  }

  public static head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().head<T>(url, config);
  }

  public static options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().options<T>(url, config);
  }

  public static post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().post<T>(url, data, config);
  }

  public static put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().put<T>(url, data, config);
  }

  public static patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return RobustAxiosFactory.getDefaultInstance().patch<T>(url, data, config);
  }

  // Additional static methods
  public static all<T>(values: Array<T | Promise<T>>): Promise<T[]> {
    return axios.all(values);
  }

  public static spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R {
    return axios.spread(callback);
  }

  public static isCancel(value: unknown): boolean {
    return axios.isCancel(value);
  }

  public static isAxiosError(payload: unknown): payload is AxiosError {
    return axios.isAxiosError(payload);
  }

  public static CancelToken = axios.CancelToken;
  public static Cancel = axios.Cancel;

  public static getUri(config?: AxiosRequestConfig): string {
    return RobustAxiosFactory.getDefaultInstance().getUri(config);
  }

  public static setDefaultHeader(key: string, value: string): void {
    return RobustAxiosFactory.getDefaultInstance().setDefaultHeader(key, value);
  }

  public static updateConfig(newConfig: AxiosRequestConfig): void {
    return RobustAxiosFactory.getDefaultInstance().updateConfig(newConfig);
  }
} 