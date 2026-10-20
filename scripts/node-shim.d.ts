declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options?: { encoding: "utf-8" },
  ): string;
}
