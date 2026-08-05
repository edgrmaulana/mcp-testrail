import { vi } from 'vitest';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { TestRailClient } from '../../../src/client/api/index.js';
import { TestRailClientConfig } from '../../../src/client/api/baseClient.js';

// Mock axios
vi.mock('axios');

// Function to set up standard mocks.
// Return type is the mocked instance itself so specs can call vitest mock
// methods (mockResolvedValue, etc.) on get/post without casting each site.
type MockedAxiosInstance = AxiosInstance & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};

export function setupMocks(): MockedAxiosInstance {
  // Mock axios instance
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    defaults: {
      headers: {
        common: {}
      },
      timeout: 30000
    },
    interceptors: {
      request: {
        use: vi.fn(),
        eject: vi.fn(),
        clear: vi.fn()
      },
      response: {
        use: vi.fn((fn) => fn),
        eject: vi.fn(),
        clear: vi.fn()
      }
    }
  } as unknown as MockedAxiosInstance;
  
  // Setup axios mocks
  vi.mocked(axios.create).mockReturnValue(mockAxiosInstance);
  
  return mockAxiosInstance;
}

// Create a client for testing
export function createTestClient() {
  const mockConfig: TestRailClientConfig = {
    baseURL: 'https://example.testrail.com',
    auth: {
      username: 'test@example.com',
      password: 'api_key'
    }
  };
  
  return new TestRailClient(mockConfig);
} 