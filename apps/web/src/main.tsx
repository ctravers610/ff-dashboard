import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UnauthorizedError, type Me } from './api';
import Root from './Root';
import './index.css';

// If any request comes back 401 (the session expired or was signed out
// elsewhere), switch to the sign-in screen instead of showing errors everywhere.
const onError = (error: Error) => {
  if (error instanceof UnauthorizedError) {
    queryClient.setQueryData<Me>(['me'], { authEnabled: true, user: null });
  }
};

// TanStack Query handles fetching, caching and background refreshing for us.
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    // Retry flaky network errors, but not "sign in required": that won't fix itself.
    queries: { retry: (failures, error) => !(error instanceof UnauthorizedError) && failures < 3 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
