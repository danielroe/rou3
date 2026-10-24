import { NullProtoObj } from "./object.ts";
import type { RouterContext, RouterOptions } from "./types.ts";

/**
 * Create a new router context.
 */
export function createRouter<T = unknown>(opts?: RouterOptions): RouterContext<T> {
  const ctx: RouterContext<T> = {
    root: { key: "" },
    static: new NullProtoObj(),
  };
  if (opts?.ignoreCase) {
    ctx.ignoreCase = true;
  }
  return ctx;
}
