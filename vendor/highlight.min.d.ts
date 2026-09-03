// Hand-written surface for the vendored bundle: only what peek actually calls.
declare const hljs: {
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string };
  highlightAuto(code: string): { value: string; language?: string };
  getLanguage(name: string): unknown;
  listLanguages(): string[];
};
export = hljs;
