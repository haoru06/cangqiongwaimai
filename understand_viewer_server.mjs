import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpringRuntimeIndex } from "./spring_runtime_indexer.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const uaDir = path.join(projectRoot, ".ua");
const graphPath = path.join(uaDir, "knowledge-graph.json");
const maxSourceBytes = 1024 * 1024;
const mappingRe = /@(?<kind>Get|Post|Put|Delete|Patch|Request)Mapping\s*(?:\(\s*(?:value\s*=\s*)?"(?<path>[^"]*)")?/g;

function readGraph() {
  return JSON.parse(fs.readFileSync(graphPath, "utf8"));
}

function nodesById(data) {
  return new Map(data.nodes.map(node => [node.id, node]));
}

function allowedPaths(data) {
  return new Set(data.nodes.map(node => node.filePath).filter(Boolean).map(normalizePath));
}

function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\/+/, "");
}

function safePath(rawPath, data) {
  const relative = normalizePath(rawPath);
  const candidate = path.resolve(projectRoot, relative);
  const root = path.resolve(projectRoot);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  const isSpringSource = /^sky-take-out\/sky-server\/src\/main\/(?:java|resources\/mapper)\/.+\.(?:java|xml)$/i.test(relative);
  if ((!allowedPaths(data).has(relative) && !isSpringSource) || !fs.existsSync(candidate)) return null;
  return candidate;
}

function json(res, payload, status = 200) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": body.length,
  });
  res.end(body);
}

function excerpt(filePath, range, radius = 8) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath);
  if (raw.length > maxSourceBytes || raw.includes(0)) return null;
  const lines = raw.toString("utf8").split(/\r?\n/);
  const first = Math.max(1, Number(range?.[0] || 1) - radius);
  const last = Math.min(lines.length, Number(range?.[range.length - 1] || first) + radius);
  return {
    startLine: first,
    endLine: last,
    content: lines.slice(first - 1, last).map((line, i) =>
      String(first + i).padStart(5) + " | " + line
    ).join("\n"),
  };
}

function joinRoute(...parts) {
  const value = "/" + parts.flatMap(part => String(part || "").split("/")).filter(Boolean).join("/");
  return value === "" ? "/" : value;
}

function routeGraph(data) {
  const nodes = [];
  const edges = [];
  const functions = data.nodes.filter(node =>
    node.type === "function" &&
    normalizePath(node.filePath || "").includes("/controller/") &&
    node.filePath.endsWith(".java")
  );
  for (const fn of functions) {
    const relative = normalizePath(fn.filePath);
    const filePath = path.join(projectRoot, relative);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    const classIndex = text.search(/\bclass\s+\w+/);
    const beforeClass = classIndex < 0 ? "" : text.slice(0, classIndex);
    const classMatches = [...beforeClass.matchAll(mappingRe)];
    const classPath = classMatches.at(-1)?.groups?.path || "";
    const functionLine = Number(fn.lineRange?.[0] || 1);
    const windowStart = Math.max(0, functionLine - 18);
    const window = lines.slice(windowStart, functionLine + 2).join("\n");
    const methodMatch = [...window.matchAll(mappingRe)].at(-1);
    if (!methodMatch) continue;
    let verb = methodMatch.groups.kind.toUpperCase();
    if (verb === "REQUEST") verb = "*";
    const fullPath = joinRoute(classPath, methodMatch.groups.path || "");
    const annotationLine = windowStart + window.slice(0, methodMatch.index).split("\n").length;
    const routeId = "route:" + relative + ":" + fn.name + ":" + verb + ":" + fullPath;
    nodes.push({
      id: routeId,
      type: "endpoint",
      name: verb + " " + fullPath,
      filePath: relative,
      lineRange: [annotationLine, functionLine],
      summary: verb + " " + fullPath + " routes to " + fn.name + "()",
      tags: ["spring", "route", "controller"],
    });
    edges.push({ source: routeId, target: fn.id, type: "routes", direction: "forward", weight: 0.8 });
  }
  return { nodes, edges };
}

function staticFile(res, pathname) {
  const relative = normalizePath(pathname);
  const filePath = path.resolve(uaDir, relative);
  if (filePath !== uaDir && !filePath.startsWith(uaDir + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  };
  res.writeHead(200, {
    "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:8766");
    const data = readGraph();
    if (url.pathname === "/route-graph.json") {
      json(res, routeGraph(data));
      return;
    }
    if (url.pathname === "/runtime-index.json") {
      json(res, buildSpringRuntimeIndex(projectRoot));
      return;
    }
    if (url.pathname === "/file-content.json") {
      const filePath = safePath(url.searchParams.get("path") || "", data);
      if (!filePath) {
        json(res, { error: "File is not in the knowledge graph" }, 404);
        return;
      }
      const raw = fs.readFileSync(filePath);
      if (raw.length > maxSourceBytes || raw.includes(0)) {
        json(res, { error: "File is too large or binary" }, 415);
        return;
      }
      const content = raw.toString("utf8");
      json(res, {
        path: path.relative(projectRoot, filePath).replaceAll("\\", "/"),
        content,
        lineCount: content.split(/\r?\n/).length,
      });
      return;
    }
    if (url.pathname === "/edge-evidence.json") {
      const byId = nodesById(data);
      const source = byId.get(url.searchParams.get("source"));
      const target = byId.get(url.searchParams.get("target"));
      if (!source || !target) {
        json(res, { error: "Unknown graph node" }, 404);
        return;
      }
      json(res, {
        edge: {
          source: source.id,
          target: target.id,
          type: url.searchParams.get("type") || "",
        },
        source: {
          node: source,
          excerpt: excerpt(safePath(source.filePath, data), source.lineRange),
        },
        target: {
          node: target,
          excerpt: excerpt(safePath(target.filePath, data), target.lineRange),
        },
      });
      return;
    }
    staticFile(res, url.pathname === "/" ? "/knowledge-graph-viewer.html" : url.pathname);
  } catch (error) {
    json(res, { error: String(error.message || error) }, 500);
  }
});

server.listen(8766, "127.0.0.1", () => {
  console.log("Understand viewer: http://127.0.0.1:8766/knowledge-graph-viewer.html");
});
