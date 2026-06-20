export {};

type EthRequest = (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;

declare global {
  interface Window {
    ethereum?: {
      request: EthRequest;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}
