"use client";

import { useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isApiError } from "@/lib/api/errors";

/** The session query's key; `null` data means "nobody signed in". */
export const ME_KEY = ["me"] as const;

function onError(client: () => QueryClient) {
  return (error: unknown) => {
    // 401 anywhere: the session is gone. Clearing it sends AuthGuard to /login.
    if (isApiError(error) && error.isUnauthenticated) {
      client().setQueryData(ME_KEY, null);
    }
  };
}

function makeClient(): QueryClient {
  let client: QueryClient;
  const get = () => client;
  client = new QueryClient({
    queryCache: new QueryCache({ onError: onError(get) }),
    mutationCache: new MutationCache({ onError: onError(get) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A 4xx is an answer, not a blip: never retry one.
        retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
