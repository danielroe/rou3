import { describe, it, expect } from "vitest";
import {
  addRoute,
  createRouter,
  findAllRoutes,
  findOverlappingRoutes,
  findRoute,
  removeRoute,
} from "../src/index.ts";
import type { RouterContext } from "../src/index.ts";
import { compileRouter, compileRouterToString } from "../src/compiler.ts";

type Data = { path: string };

function lookups(router: RouterContext<Data>) {
  const compiledLookup = compileRouter(router);
  // eslint-disable-next-line no-new-func
  const aotLookup = new Function(
    `return ${compileRouterToString(router)}`,
  )() as typeof compiledLookup;
  return [
    { name: "findRoute", match: (m: string, p: string) => findRoute(router, m, p) },
    { name: "compiledLookup", match: (m: string, p: string) => compiledLookup(m, p) },
    { name: "aotLookup", match: (m: string, p: string) => aotLookup(m, p) },
  ];
}

function matchAlls(router: RouterContext<Data>) {
  const compiledMatchAll = compileRouter(router, { matchAll: true });
  // eslint-disable-next-line no-new-func
  const aotMatchAll = new Function(
    `return ${compileRouterToString(router, undefined, { matchAll: true })}`,
  )() as typeof compiledMatchAll;
  const format = (res: { data: Data; params?: Record<string, string> }[]) =>
    res.map((r) => [r.data.path, { ...r.params }]);
  return {
    findAllRoutes: (m: string, p: string) => format(findAllRoutes(router, m, p)),
    compiledMatchAll: (m: string, p: string) => format(compiledMatchAll(m, p)),
    aotMatchAll: (m: string, p: string) => format(aotMatchAll(m, p)),
  };
}

describe("ignoreCase", () => {
  const routes = [
    "/About",
    "/Static/Path",
    "/Users/:id",
    "/Users/:id/Posts",
    "/Blog/:slug([A-Z]+)",
    "/protected/:slug([A-z]+)",
    "/range/:c([Z-a])",
    "/Img/*.PNG",
    "/Files/**:path",
    "/Assets/**",
    "/**",
  ];
  const router = createRouter<Data>({ ignoreCase: true });
  for (const route of routes) {
    addRoute(router, "GET", route, { path: route });
  }

  for (const { name, match } of lookups(router)) {
    it(`matches static segments (${name})`, () => {
      expect(match("GET", "/about")).toMatchObject({ data: { path: "/About" } });
      expect(match("GET", "/ABOUT/")).toMatchObject({ data: { path: "/About" } });
      expect(match("GET", "/static/PATH")).toMatchObject({ data: { path: "/Static/Path" } });
      expect(match("GET", "/USERS/Ab/posts")).toMatchObject({
        data: { path: "/Users/:id/Posts" },
        params: { id: "Ab" },
      });
    });

    it(`keeps param casing (${name})`, () => {
      expect(match("GET", "/users/AbC")).toMatchObject({
        data: { path: "/Users/:id" },
        params: { id: "AbC" },
      });
      expect(match("GET", "/img/Logo.png")).toMatchObject({
        data: { path: "/Img/*.PNG" },
        params: { "0": "Logo" },
      });
    });

    it(`keeps wildcard casing (${name})`, () => {
      expect(match("GET", "/files/A/b/C")).toMatchObject({
        data: { path: "/Files/**:path" },
        params: { path: "A/b/C" },
      });
      expect(match("GET", "/ASSETS/X/y")).toMatchObject({
        data: { path: "/Assets/**" },
        params: { _: "X/y" },
      });
      expect(match("GET", "/Other/Path")).toMatchObject({
        data: { path: "/**" },
        params: { _: "Other/Path" },
      });
    });

    it(`compiles regex constraints with the i flag (${name})`, () => {
      expect(match("GET", "/blog/abc")).toMatchObject({
        data: { path: "/Blog/:slug([A-Z]+)" },
        params: { slug: "abc" },
      });
      expect(match("GET", "/BLOG/AbC")).toMatchObject({ params: { slug: "AbC" } });
      expect(match("GET", "/blog/ab1")).toMatchObject({ data: { path: "/**" } });
      expect(match("GET", "/protected/_")).toMatchObject({
        data: { path: "/protected/:slug([A-z]+)" },
        params: { slug: "_" },
      });
      expect(match("GET", "/PROTECTED/Ab_c")).toMatchObject({ params: { slug: "Ab_c" } });
      expect(match("GET", "/range/z")).toMatchObject({ data: { path: "/range/:c([Z-a])" } });
    });
  }

  it("findAllRoutes agrees with compiled matchAll", () => {
    const matchers = matchAlls(router);
    const paths = [
      "/about",
      "/ABOUT/",
      "/static/path",
      "/users/AbC",
      "/USERS/x/POSTS",
      "/blog/abc",
      "/blog/ab1",
      "/protected/_",
      "/range/z",
      "/img/Logo.png",
      "/files/A/b",
      "/assets",
      "/Assets/X/y",
      "/other",
    ];
    for (const path of paths) {
      const expected = matchers.findAllRoutes("GET", path);
      expect(matchers.compiledMatchAll("GET", path)).toEqual(expected);
      expect(matchers.aotMatchAll("GET", path)).toEqual(expected);
    }
    expect(matchers.findAllRoutes("GET", "/BLOG/AbC")).toEqual([
      ["/**", { _: "BLOG/AbC" }],
      ["/Blog/:slug([A-Z]+)", { slug: "AbC" }],
    ]);
  });

  it("folds percent-encoded segments by their encoded text", () => {
    const router = createRouter<Data>({ ignoreCase: true });
    addRoute(router, "GET", "/Caf%C3%A9", { path: "CAFE" });
    for (const { match } of lookups(router)) {
      expect(match("GET", "/CAF%c3%a9")).toMatchObject({ data: { path: "CAFE" } });
      expect(match("GET", "/caf%C3%89")).toBeUndefined();
    }
  });

  it("extracts wildcard tails when lower-casing changes the prefix length", () => {
    const router = createRouter<Data>({ ignoreCase: true });
    addRoute(router, "GET", "/\u0130/**:rest", { path: "DOTTED" });
    for (const { match } of lookups(router)) {
      expect(match("GET", "/\u0130/A/b")).toMatchObject({ params: { rest: "A/b" } });
      expect(match("GET", "/i\u0307/A/b")).toMatchObject({ params: { rest: "A/b" } });
    }
  });

  it("matches static and segment maps (compiled parity)", () => {
    const router = createRouter<Data>({ ignoreCase: true });
    for (let i = 0; i < 40; i++) {
      addRoute(router, "GET", `/Page${i}`, { path: `/Page${i}` });
      addRoute(router, "GET", `/Page${i}/:id`, { path: `/Page${i}/:id` });
    }
    for (const { match } of lookups(router)) {
      expect(match("GET", "/page7")).toMatchObject({ data: { path: "/Page7" } });
      expect(match("GET", "/PAGE39/")).toMatchObject({ data: { path: "/Page39" } });
      expect(match("GET", "/page39/X")).toMatchObject({
        data: { path: "/Page39/:id" },
        params: { id: "X" },
      });
      expect(match("GET", "/page40")).toBeUndefined();
    }
    const matchers = matchAlls(router);
    for (const path of ["/page7", "/PAGE39/", "/page39/X", "/page40"]) {
      const expected = matchers.findAllRoutes("GET", path);
      expect(matchers.compiledMatchAll("GET", path)).toEqual(expected);
      expect(matchers.aotMatchAll("GET", path)).toEqual(expected);
    }
  });

  it("removes routes regardless of casing", () => {
    const router = createRouter<Data>({ ignoreCase: true });
    addRoute(router, "GET", "/Foo/Bar", { path: "/Foo/Bar" });
    removeRoute(router, "GET", "/foo/BAR");
    expect(findRoute(router, "GET", "/foo/bar")).toBeUndefined();
    expect(router.root.static).toBeUndefined();
  });

  it("findOverlappingRoutes folds the query pattern", () => {
    const router = createRouter<Data>({ ignoreCase: true });
    addRoute(router, "GET", "/Admin/**", { path: "/Admin/**" });
    addRoute(router, "GET", "/admin/:id([A-Z]+)", { path: "/admin/:id([A-Z]+)" });
    expect(findOverlappingRoutes(router, "GET", "/ADMIN/abc").map((m) => m.data.path)).toEqual([
      "/Admin/**",
      "/admin/:id([A-Z]+)",
    ]);
  });

  it("is case-sensitive by default", () => {
    const router = createRouter<Data>();
    for (const route of routes) {
      addRoute(router, "GET", route, { path: route });
    }
    for (const { match } of lookups(router)) {
      expect(match("GET", "/About")).toMatchObject({ data: { path: "/About" } });
      expect(match("GET", "/about")).toMatchObject({ data: { path: "/**" } });
      expect(match("GET", "/Blog/abc")).toMatchObject({ data: { path: "/**" } });
      expect(match("GET", "/Blog/ABC")).toMatchObject({ data: { path: "/Blog/:slug([A-Z]+)" } });
      expect(match("GET", "/Users/AbC")).toMatchObject({ params: { id: "AbC" } });
    }
  });
});
