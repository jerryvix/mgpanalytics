import { describe, it, expect, vi, afterEach } from "vitest";
import handler, { boardPageUrl, parseBoardParams } from "../../api/drafttek-board.js";

type MockRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  status: (code: number) => MockRes;
  setHeader: (k: string, v: string) => void;
  send: (b: string) => MockRes;
};

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) { res.statusCode = code; return res; },
    setHeader(k, v) { res.headers[k] = v; },
    send(b) { res.body = b; return res; },
  };
  return res;
}

afterEach(() => vi.unstubAllGlobals());

describe("drafttek relay", () => {
  it("only accepts a draft year and pages 1-3", () => {
    expect(parseBoardParams({ year: "2027", page: "1" })).toEqual({ year: 2027, page: 1 });
    expect(parseBoardParams({ year: "2027", page: "3" })).toEqual({ year: 2027, page: 3 });
    expect(parseBoardParams({ year: "2027", page: "4" })).toBeNull();
    expect(parseBoardParams({ year: "2027", page: "0" })).toBeNull();
    expect(parseBoardParams({ year: "1999", page: "1" })).toBeNull();
    expect(parseBoardParams({ year: "2027", page: "1.5" })).toBeNull();
    expect(parseBoardParams({ year: "https://evil.example", page: "1" })).toBeNull();
    expect(parseBoardParams({})).toBeNull();
  });

  it("builds only DraftTek board URLs", () => {
    expect(boardPageUrl(2027, 2)).toBe(
      "https://www.drafttek.com/2027-NFL-Draft-Big-Board/Top-NFL-Draft-Prospects-2027-Page-2.asp",
    );
  });

  it("rejects bad params and non-GET without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const bad = mockRes();
    await handler({ method: "GET", query: { year: "2027", page: "9" } }, bad);
    expect(bad.statusCode).toBe(400);
    const post = mockRes();
    await handler({ method: "POST", query: { year: "2027", page: "1" } }, post);
    expect(post.statusCode).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("relays the page HTML with edge caching", async () => {
    const fetchSpy = vi.fn(async () => new Response("<html>2027 NFL Draft Big Board</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = mockRes();
    await handler({ method: "GET", query: { year: "2027", page: "1" } }, res);
    expect(fetchSpy).toHaveBeenCalledWith(boardPageUrl(2027, 1), expect.anything());
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("2027 NFL Draft Big Board");
    expect(res.headers["Cache-Control"]).toContain("s-maxage=1800");
  });

  it("returns 502 when DraftTek fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const res = mockRes();
    await handler({ method: "GET", query: { year: "2027", page: "2" } }, res);
    expect(res.statusCode).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("reset"); }));
    const res2 = mockRes();
    await handler({ method: "GET", query: { year: "2027", page: "2" } }, res2);
    expect(res2.statusCode).toBe(502);
    expect(res2.body).toContain("reset");
  });
});
