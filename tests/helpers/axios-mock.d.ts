import { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Re-declare the module to extend it
declare module './axios-mock' {
  interface AxiosMock {
    /**
     * Allows providing a custom function to handle mock responses/errors dynamically.
     * This is useful for tests that need to change behavior based on request count or other state.
     * @param fn A function that takes the AxiosRequestConfig and returns a Promise resolving to AxiosResponse or rejecting with an error.
     */
    mockImplementation(fn: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse> | Promise<never>): void;
  }
}

// Export something to make it a module
export {};
