import { AsyncLocalStorage } from "node:async_hooks";

export interface BugcrowdCredentials {
  username: string;
  password: string;
}

const credentialsStorage = new AsyncLocalStorage<BugcrowdCredentials>();

export function runWithBugcrowdCredentials<T>(
  credentials: BugcrowdCredentials,
  callback: () => T
): T {
  return credentialsStorage.run(credentials, callback);
}

export function getBugcrowdCredentials(): BugcrowdCredentials | undefined {
  return credentialsStorage.getStore();
}
