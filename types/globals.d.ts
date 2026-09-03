// Globals peek relies on that no standard library declares.

interface MermaidApi {
  initialize(config: { startOnLoad?: boolean; theme?: string; securityLevel?: string }): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

interface Window {
  // Loaded lazily from /assets/mermaid.min.js, and only when a document
  // actually contains a diagram — so it is absent more often than not.
  mermaid?: MermaidApi;
}
