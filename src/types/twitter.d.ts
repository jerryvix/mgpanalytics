// Twitter Widget Types
declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: HTMLElement) => void;
        createTimeline: (
          options: { sourceType: string; screenName: string },
          element: HTMLElement,
          params?: Record<string, unknown>
        ) => Promise<HTMLElement>;
      };
    };
  }
}

export {};
