import axios from 'axios';
import { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

type AxiosMethod = 'request' | 'get' | 'delete' | 'head' | 'options' | 'post' | 'put' | 'patch';

/**
 * Helper class for mocking Axios in tests
 */
export class AxiosMock {
  private originalAxiosCreate: typeof axios.create;
  private mockInstances: AxiosInstance[] = [];
  private responseMap: Map<string, AxiosResponse> = new Map();
  private errorMap: Map<string, AxiosError | Error> = new Map();
  
  constructor() {
    this.originalAxiosCreate = axios.create;
    
    // Mock the axios.create method
    axios.create = (config?: AxiosRequestConfig) => {
      const instance = this.originalAxiosCreate(config);
      
      // Override instance methods
      this.mockInstanceMethods(instance);
      this.mockInstances.push(instance);
      
      return instance;
    };
  }
  
  /**
   * Mock response for a specific URL pattern
   */
  public mockResponse(urlPattern: string, response: AxiosResponse): void {
    this.responseMap.set(urlPattern, response);
  }
  
  /**
   * Mock error for a specific URL pattern
   */
  public mockError(urlPattern: string, error: AxiosError | Error): void {
    this.errorMap.set(urlPattern, error);
  }
  
  /**
   * Reset all mocks
   */
  public reset(): void {
    this.responseMap.clear();
    this.errorMap.clear();
    this.mockInstances = [];
    axios.create = this.originalAxiosCreate;
  }
  
  /**
   * Get the count of instances created
   */
  public getInstanceCount(): number {
    return this.mockInstances.length;
  }
  
  /**
   * Override instance methods to return mocked responses
   */
  private mockInstanceMethods(instance: AxiosInstance): void {
    const methodsToMock: AxiosMethod[] = ['request', 'get', 'delete', 'head', 'options', 'post', 'put', 'patch'];
    
    for (const method of methodsToMock) {
      // We need to type the original method correctly
      const originalMethod = instance[method].bind(instance) as (...args: unknown[]) => Promise<unknown>;
      
      // Type assertion needed because TypeScript doesn't understand we're only using valid method names
      (instance[method] as unknown) = async (...args: unknown[]) => {
        // Extract URL from arguments
        let url = '';
        let reqConfig: AxiosRequestConfig = {};

        if (method === 'request') {
          reqConfig = (args[0] as AxiosRequestConfig);
          url = reqConfig.url || '';
        } else {
          url = args[0] as string || '';
          // Simplified config reconstruction for matching
          if (args[1] && typeof args[1] === 'object') {
            reqConfig = args[1] as AxiosRequestConfig;
          }
          reqConfig.url = url;
          reqConfig.method = method.toUpperCase();
        }
         // Ensure baseURL is applied if not present in config.url for matching
        if (instance.defaults.baseURL && reqConfig.url && !reqConfig.url.startsWith('http')) {
            reqConfig.url = instance.defaults.baseURL + (reqConfig.url.startsWith('/') ? '' : '/') + reqConfig.url;
        }

        // Check if there's a mock response for this URL
        for (const [pattern, response] of this.responseMap.entries()) {
          // Use full URL for matching if available, otherwise fallback to simple includes
          const matchUrl = response.config?.url || pattern;
          if (reqConfig.url === matchUrl || reqConfig.url?.includes(pattern)) {
            return Promise.resolve(response);
          }
        }
        
        // Check if there's a mock error for this URL
        for (const [pattern, error] of this.errorMap.entries()) {
          const errorConfig = (error as AxiosError).config;
          const matchUrl = errorConfig?.url || pattern;
           if (reqConfig.url === matchUrl || reqConfig.url?.includes(pattern)) {
            return Promise.reject(error);
          }
        }
        
        // If no mock found, call original method with appropriate typing
        return originalMethod.apply(instance, args);
      };
    }
  }

  public mockImplementation(fn: (config: AxiosRequestConfig) => Promise<AxiosResponse> | Promise<never>): void {
    // Clear existing specific mocks if any, as this is a global override
    this.responseMap.clear();
    this.errorMap.clear();
  
    // Define a new way to mock instance methods using the provided function
    const newMockInstanceMethods = (instance: AxiosInstance) => {
      const methodsToMock: AxiosMethod[] = ['request', 'get', 'delete', 'head', 'options', 'post', 'put', 'patch'];
      methodsToMock.forEach(m => {
        (instance[m] as unknown) = async (...args: unknown[]) => {
          let config: AxiosRequestConfig; // Changed here
          if (m === 'request') {
            config = args[0] as AxiosRequestConfig; // Changed here
          } else {
            const urlArg = args[0] as string;
            const dataOrReqConfig = args[1];
            const reqConfigArg = args[2] || {}; // Default to empty object
            
            if ((m === 'post' || m === 'put' || m === 'patch') && dataOrReqConfig !== undefined) {
              config = { url: urlArg, data: dataOrReqConfig, ...(reqConfigArg as object), method: m.toUpperCase() } as AxiosRequestConfig;
            } else {
              config = { url: urlArg, ...(dataOrReqConfig as object || {}), method: m.toUpperCase() } as AxiosRequestConfig;
            }
          }
          
          // Apply instance defaults like baseURL
          config.baseURL = instance.defaults.baseURL;
          if (config.url && !config.url.startsWith('http') && config.baseURL) {
            config.url = config.baseURL + (config.url.startsWith('/') ? '' : '/') + config.url;
          }
          // Apply other defaults if necessary, e.g., headers
          // The structure of instance.defaults.headers is { common, get, post, ... }
          // So, instance.defaults.headers[m as string] would be one of these method-specific header objects or common.
          const methodSpecificHeaders = instance.defaults.headers[m as keyof typeof instance.defaults.headers] || {};
          config.headers = { 
            ...(instance.defaults.headers.common || {}), 
            ...(methodSpecificHeaders as object), // Ensure it's treated as an object
            ...(config.headers || {}) 
          };


          return fn(config);
        };
      });
    };
  
    // Override the internal mockInstanceMethods function for future instances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any)._mockInstanceMethodsFn = newMockInstanceMethods;
  
    // Re-apply to any existing instances
    this.mockInstances.forEach(instance => newMockInstanceMethods(instance));
  
    // Ensure new instances also get this implementation by overriding part of axios.create logic
    axios.create = (config?: AxiosRequestConfig): AxiosInstance => {
      const instance = this.originalAxiosCreate(config);
      newMockInstanceMethods(instance); // Apply the new mock logic
      this.mockInstances.push(instance);
      return instance;
    };
  }
} 
// Add a placeholder for the new internal function pointer to the class definition
// This is a bit of a hack due to TypeScript's nature. A cleaner way might involve a more significant refactor.
declare module 'axios' {
  interface AxiosStatic {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _mockInstanceMethodsFn?: (instance: AxiosInstance) => void;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(AxiosMock.prototype as any)._mockInstanceMethodsFn = (AxiosMock.prototype as any).mockInstanceMethods;

// Modify the constructor to use this new function pointer if available
const originalConstructor = AxiosMock.prototype.constructor;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
AxiosMock.prototype.constructor = function (this: AxiosMock, ...args: any[]) {
  originalConstructor.apply(this, args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self = this as any;
  self.originalAxiosCreate = axios.create; // Keep a reference to the potentially mocked create

  axios.create = (config?: AxiosRequestConfig): AxiosInstance => {
    const instance = self.originalAxiosCreate(config); // Call original/mocked create
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const methodsFn = (self as any)._mockInstanceMethodsFn || self.mockInstanceMethods;
    methodsFn.call(self, instance); // Apply the correct method mocking logic
    self.mockInstances.push(instance);
    return instance;
  };
} as any;