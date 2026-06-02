import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/cma/client";

describe("withRetry", () => {
  it("retries on 429 then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { attempts: 3, baseMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 422 and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("bad"), { status: 422 }));
    await expect(withRetry(fn, { attempts: 3, baseMs: 0 })).rejects.toThrow("bad");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
