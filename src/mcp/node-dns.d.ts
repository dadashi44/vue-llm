// Minimal typings for the optional `node:dns` import in ssrf.ts (the project does not depend on @types/node)
declare module 'node:dns' {
  export const promises: {
    lookup(host: string, options: { all: true; verbatim?: boolean }): Promise<{ address: string; family: number }[]>
  } | undefined
}
