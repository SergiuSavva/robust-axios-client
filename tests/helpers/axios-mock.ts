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
        if (method === 'request') {
          url = (args[0] as AxiosRequestConfig)?.url || '';
        } else {
          url = args[0] as string || '';
        }
        
        // Check if there's a mock response for this URL
        for (const [pattern, response] of this.responseMap.entries()) {
          if (url.includes(pattern)) {
            return Promise.resolve(response);
          }
        }
        
        // Check if there's a mock error for this URL
        for (const [pattern, error] of this.errorMap.entries()) {
          if (url.includes(pattern)) {
            return Promise.reject(error);
          }
        }
        
        // If no mock found, call original method with appropriate typing
        return originalMethod.apply(instance, args);
      };
    }
  }
} 