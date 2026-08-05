import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { setupMocks, createTestClient } from './testHelper';

describe('TestRailClient Configuration', () => {
  let mockAxiosInstance: ReturnType<typeof setupMocks>;
  let client: ReturnType<typeof createTestClient>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosInstance = setupMocks();
    client = createTestClient();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('successfully creates a client instance', () => {
    // Verify the client instance is created correctly
    expect(client).toBeDefined();
    expect(client.setHeader).toBeInstanceOf(Function);
  });
  
  it('sets custom headers correctly', () => {
    // Test setting a custom header
    client.setHeader('X-Custom-Header', 'CustomValue');
    
    // Verify header was set
    expect(mockAxiosInstance.defaults.headers.common['X-Custom-Header']).toBe('CustomValue');
  });
}); 