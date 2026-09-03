// Hand-written surface for the vendored bundle: only what peek actually calls.
// Keeps the type checker out of 90 KB of minified upstream code.
export interface MarkedOptions {
  gfm?: boolean;
  breaks?: boolean;
  renderer?: Record<string, (...args: any[]) => string>;
}
export class Marked {
  constructor(options?: MarkedOptions);
  use(extension: MarkedOptions): this;
  parse(markdown: string): string;
}
