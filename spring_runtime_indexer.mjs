import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const javaRootParts = ["sky-take-out", "sky-server", "src", "main", "java"];
const modelRootParts = ["sky-take-out", "sky-pojo", "src", "main", "java"];
const resourceRootParts = ["sky-take-out", "sky-server", "src", "main", "resources", "mapper"];
const mappingPattern = /@(Get|Post|Put|Delete|Patch|Request)Mapping\s*(?:\(([\s\S]*?)\))?/g;
const methodPattern = /^[\t ]*(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?(?:[\w<>, ?\[\].]+)\s+([A-Za-z_$]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[^\{]+)?\s*\{/gm;

function walk(dir, extension) {
  if (!fs.existsSync(dir)) return [];
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(fullPath, extension));
    else if (entry.isFile() && fullPath.endsWith(extension)) output.push(fullPath);
  }
  return output;
}

function rel(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replaceAll("\\", "/");
}

function modelKindForPath(filePath) {
  if (/\/dto\//.test(filePath)) return "dto";
  if (/\/vo\//.test(filePath)) return "vo";
  if (/\/entity\//.test(filePath)) return "entity";
  return "";
}

function lineAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function findBlockEnd(text, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}" && --depth === 0) return index;
  }
  return text.length - 1;
}

function joinRoute(...parts) {
  const route = "/" + parts.flatMap(part => String(part || "").split("/")).filter(Boolean).join("/");
  return route === "/" ? route : route.replace(/\/{2,}/g, "/");
}

function mappingFrom(text) {
  const mappings = [];
  for (const match of text.matchAll(mappingPattern)) {
    const kind = match[1];
    const args = match[2] || "";
    const quoted = args.match(/"([^"]*)"/);
    const verbs = kind === "Request"
      ? [...args.matchAll(/RequestMethod\.(GET|POST|PUT|DELETE|PATCH)/g)].map(item => item[1])
      : [kind.toUpperCase()];
    mappings.push({
      verb: verbs.length ? verbs : ["*"],
      path: quoted ? quoted[1] : "",
      index: match.index || 0,
    });
  }
  return mappings;
}

function parseMethods(text, includeDeclarations = false) {
  const methods = [];
  for (const match of text.matchAll(methodPattern)) {
    const openingBrace = (match.index || 0) + match[0].lastIndexOf("{");
    const end = findBlockEnd(text, openingBrace);
    methods.push({
      name: match[1],
      start: match.index || 0,
      end,
      bodyStart: openingBrace + 1,
      body: text.slice(openingBrace + 1, end),
      lineRange: [lineAt(text, match.index || 0), lineAt(text, end)],
      annotations: text.slice(Math.max(0, (match.index || 0) - 1800), match.index || 0),
    });
  }
  if (includeDeclarations) {
    const declarationPattern = /^[\t ]*(?:public\s+)?(?:abstract\s+)?(?:default\s+)?(?:[\w<>, ?\[\].]+)\s+([A-Za-z_$]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[^;]+)?\s*;/gm;
    for (const match of text.matchAll(declarationPattern)) {
      methods.push({
        name: match[1],
        start: match.index || 0,
        end: (match.index || 0) + match[0].length,
        bodyStart: (match.index || 0) + match[0].length,
        body: "",
        lineRange: [lineAt(text, match.index || 0), lineAt(text, (match.index || 0) + match[0].length)],
        annotations: text.slice(Math.max(0, (match.index || 0) - 1800), match.index || 0),
      });
    }
  }
  return methods;
}

function parseJava(projectRoot, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const classMatch = /\b(?:class|interface)\s+([A-Za-z_$]\w*)(?:\s+extends\s+[^\{]+?)?(?:\s+implements\s+([^\{]+))?\s*\{/.exec(text);
  if (!classMatch) return null;
  const relative = rel(projectRoot, filePath);
  const classOffset = classMatch.index || 0;
  const classLine = lineAt(text, classOffset);
  const implementsNames = (classMatch[2] || "").match(/[A-Za-z_$]\w*/g) || [];
  const fields = [];
  for (const match of text.matchAll(/\bprivate\s+(?:final\s+)?([A-Z][A-Za-z0-9_$]*)\s+([A-Za-z_$]\w*)\s*;/g)) {
    fields.push({ type: match[1], name: match[2], line: lineAt(text, match.index || 0) });
  }
  const beforeClass = text.slice(0, classOffset);
  const classMappings = mappingFrom(beforeClass);
  const lastClassMapping = classMappings.at(-1);
  const isController = /\/(?:controller)\//.test(relative) || /@(?:RestController|Controller)\b/.test(beforeClass);
  const modelKind = modelKindForPath(relative);
  return {
    name: classMatch[1],
    filePath: relative,
    text,
    classLine,
    classLineRange: [classLine, classLine],
    implementsNames,
    fields,
    methods: parseMethods(text, /\binterface\b/.test(classMatch[0])),
    isController,
    isService: /\/service\/[^/]+Service\.java$/.test(relative),
    isServiceImpl: /\/service\/impl\/.+ServiceImpl\.java$/.test(relative),
    isMapper: /\/mapper\/.+Mapper\.java$/.test(relative),
    isConfig: /@Configuration\b/.test(beforeClass),
    isInterceptor: /\/interceptor\/.+Interceptor\.java$/.test(relative),
    modelKind,
    basePath: lastClassMapping?.path || "",
  };
}

function findMethod(info, name) {
  return info?.methods.find(method => method.name === name) || null;
}

function directCalls(info, method, knownFieldTypes) {
  if (!info || !method) return [];
  const fields = new Map(info.fields.filter(field => knownFieldTypes.has(field.type)).map(field => [field.name, field]));
  const calls = [];
  const seen = new Set();
  for (const match of method.body.matchAll(/\b([A-Za-z_$]\w*)\.([A-Za-z_$]\w*)\s*\(/g)) {
    const field = fields.get(match[1]);
    if (!field) continue;
    const key = field.name + "." + match[2];
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push({
      receiver: field.name,
      receiverType: field.type,
      methodName: match[2],
      line: lineAt(info.text, method.bodyStart + (match.index || 0)),
    });
  }
  return calls;
}

function parseXmlStatements(projectRoot) {
  const output = new Map();
  for (const filePath of walk(path.join(projectRoot, ...resourceRootParts), ".xml")) {
    const text = fs.readFileSync(filePath, "utf8");
    const mapperName = path.basename(filePath, ".xml");
    const statements = new Map();
    for (const match of text.matchAll(/<(?:select|insert|update|delete)\s+[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
      statements.set(match[1], {
        name: mapperName + ".xml#" + match[1],
        filePath: rel(projectRoot, filePath),
        lineRange: [lineAt(text, match.index || 0), lineAt(text, match.index || 0)],
        signature: match[0],
      });
    }
    output.set(mapperName, statements);
  }
  return output;
}

function endpointMappings(info, method) {
  const mappings = mappingFrom(method.annotations).filter(mapping =>
    method.annotations.slice(mapping.index).split(/\r?\n/).length <= 16
  );
  const mapping = mappings.at(-1);
  if (!mapping) return [];
  const annotationLine = method.lineRange[0] - (method.annotations.slice(mapping.index).split(/\r?\n/).length - 1);
  return mapping.verb.map(verb => ({
    verb,
    path: joinRoute(info.basePath, mapping.path),
    lineRange: [Math.max(1, annotationLine), method.lineRange[0]],
  }));
}

function interceptorBindings(infos) {
  const bindings = [];
  for (const config of infos.filter(info => info.isConfig)) {
    for (const match of config.text.matchAll(/registry\.addInterceptor\(\s*([A-Za-z_$]\w*)\s*\)\s*\.addPathPatterns\(\s*"([^"]+)"/g)) {
      const field = config.fields.find(item => item.name === match[1]);
      const statementEnd = config.text.indexOf(";", match.index || 0);
      const statement = config.text.slice(match.index || 0, statementEnd < 0 ? config.text.length : statementEnd);
      const excludes = [...statement.matchAll(/\.excludePathPatterns\(\s*"([^"]+)"/g)].map(item => item[1]);
      bindings.push({
        config: { name: config.name, filePath: config.filePath, lineRange: [lineAt(config.text, match.index || 0), lineAt(config.text, (match.index || 0) + match[0].length)] },
        interceptorName: field?.type || match[1],
        pattern: match[2],
        excludes,
      });
    }
  }
  return bindings;
}

function routeMatches(pattern, route) {
  const prefix = pattern.replace(/\/\*\*$/, "");
  return route === prefix || route.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}

function clientForController(info) {
  if (/\/controller\/admin\//.test(info.filePath) || info.basePath.startsWith("/admin/")) return "admin";
  if (/\/controller\/user\//.test(info.filePath) || info.basePath.startsWith("/user/")) return "user";
  return "shared";
}

function sourceNode(name, filePath, lineRange, kind) {
  return { name, filePath, lineRange, kind };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function modelUsesForMethod(owner, method, source, models) {
  if (!owner || !method || !source || !models.size) return [];
  const text = owner.text.slice(method.start, method.end + 1);
  const uses = [];
  for (const model of models.values()) {
    const match = new RegExp("\\b" + escapeRegExp(model.name) + "\\b").exec(text);
    if (!match) continue;
    const line = lineAt(owner.text, method.start + (match.index || 0));
    uses.push({
      source,
      model: sourceNode(model.name, model.filePath, model.classLineRange, model.modelKind),
      evidence: { relation: "usesModel", filePath: owner.filePath, lineRange: [line, line] },
    });
  }
  return uses;
}

function modelUsesForXmlStatement(statement, source, models) {
  if (!statement || !source || !models.size) return [];
  const signature = statement.signature || "";
  const uses = [];
  for (const model of models.values()) {
    if (!new RegExp("\\b" + escapeRegExp(model.name) + "\\b").test(signature)) continue;
    uses.push({
      source,
      model: sourceNode(model.name, model.filePath, model.classLineRange, model.modelKind),
      evidence: { relation: "usesModel", filePath: statement.filePath, lineRange: statement.lineRange },
    });
  }
  return uses;
}

function appendModelUses(target, uses) {
  for (const use of uses) {
    const key = [use.source.filePath, use.source.lineRange?.[0] || 0, use.model.filePath].join(":");
    if (!target.some(existing => [existing.source.filePath, existing.source.lineRange?.[0] || 0, existing.model.filePath].join(":") === key)) {
      target.push(use);
    }
  }
}

function recentAnnotations(method) {
  return method.annotations.split(/\r?\n/).slice(-16).join("\n");
}

function collectEntryPoints(infos, controllers) {
  const entries = controllers.flatMap(controller => controller.endpoints.map(endpoint => ({
    id: "entry:http:" + endpoint.id,
    kind: "http",
    name: endpoint.verb + " " + endpoint.path,
    filePath: endpoint.filePath,
    lineRange: endpoint.lineRange,
    targetId: endpoint.id,
    group: controller.name,
  })));
  for (const info of infos) {
    for (const method of info.methods) {
      const annotations = recentAnnotations(method);
      const signature = info.text.slice(method.start, method.bodyStart);
      const kind = /@Scheduled\b/.test(annotations) ? "schedule"
        : /@(Kafka|Rabbit|Jms|Sqs)Listener\b/.test(annotations) ? "message"
        : /\bstatic\s+void\s+main\s*\(/.test(signature) ? "bootstrap"
        : "";
      if (!kind) continue;
      entries.push({
        id: "entry:" + kind + ":" + info.filePath + ":" + method.name + ":" + method.lineRange[0],
        kind,
        name: info.name + "." + method.name + "()",
        filePath: info.filePath,
        lineRange: method.lineRange,
        targetId: null,
        group: info.name,
      });
    }
  }
  return entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export function buildSpringRuntimeIndex(projectRoot) {
  const serverJavaRoot = path.join(projectRoot, ...javaRootParts);
  const modelJavaRoot = path.join(projectRoot, ...modelRootParts);
  const serverInfos = walk(serverJavaRoot, ".java").map(filePath => parseJava(projectRoot, filePath)).filter(Boolean);
  const modelInfos = walk(modelJavaRoot, ".java").map(filePath => parseJava(projectRoot, filePath)).filter(Boolean);
  const infos = [...serverInfos, ...modelInfos];
  const models = new Map(infos.filter(info => info.modelKind).map(info => [info.name, info]));
  const byName = new Map(infos.map(info => [info.name, info]));
  const services = new Map(infos.filter(info => info.isService).map(info => [info.name, info]));
  const mappers = new Map(infos.filter(info => info.isMapper).map(info => [info.name, info]));
  const implsByService = new Map();
  for (const impl of infos.filter(info => info.isServiceImpl)) {
    for (const serviceName of impl.implementsNames) {
      if (!implsByService.has(serviceName)) implsByService.set(serviceName, []);
      implsByService.get(serviceName).push(impl);
    }
  }
  const xmlStatements = parseXmlStatements(projectRoot);
  const bindings = interceptorBindings(infos);
  const controllers = [];

  for (const controller of infos.filter(info => info.isController)) {
    const endpoints = [];
    for (const method of controller.methods) {
      for (const route of endpointMappings(controller, method)) {
        const controllerSource = sourceNode(controller.name + "." + method.name + "()", controller.filePath, method.lineRange, "controller");
        const chains = [];
        const modelUses = [];
        appendModelUses(modelUses, modelUsesForMethod(controller, method, controllerSource, models));
        for (const serviceCall of directCalls(controller, method, services)) {
          const service = services.get(serviceCall.receiverType);
          const serviceMethod = findMethod(service, serviceCall.methodName);
          const serviceSource = sourceNode(service.name + "." + serviceCall.methodName + "()", service.filePath, serviceMethod?.lineRange || service.classLineRange, "service");
          appendModelUses(modelUses, modelUsesForMethod(service, serviceMethod, serviceSource, models));
          const impls = implsByService.get(service.name) || [];
          if (!impls.length) {
            chains.push({
              id: controllerSource.name + "->" + serviceSource.name,
              steps: [controllerSource, { ...serviceSource, evidence: { relation: "calls", filePath: controller.filePath, lineRange: [serviceCall.line, serviceCall.line] } }],
              complete: false,
            });
            continue;
          }
          for (const impl of impls) {
            const implMethod = findMethod(impl, serviceCall.methodName);
            const implSource = sourceNode(impl.name + "." + serviceCall.methodName + "()", impl.filePath, implMethod?.lineRange || impl.classLineRange, "implementation");
            appendModelUses(modelUses, modelUsesForMethod(impl, implMethod, implSource, models));
            const steps = [
              controllerSource,
              { ...serviceSource, evidence: { relation: "calls", filePath: controller.filePath, lineRange: [serviceCall.line, serviceCall.line] } },
              { ...implSource, evidence: { relation: "implements", filePath: impl.filePath, lineRange: impl.classLineRange } },
            ];
            for (const mapperCall of directCalls(impl, implMethod, mappers)) {
              const mapper = mappers.get(mapperCall.receiverType);
              const mapperMethod = findMethod(mapper, mapperCall.methodName);
              const mapperSource = sourceNode(mapper.name + "." + mapperCall.methodName + "()", mapper.filePath, mapperMethod?.lineRange || mapper.classLineRange, "mapper");
              appendModelUses(modelUses, modelUsesForMethod(mapper, mapperMethod, mapperSource, models));
              steps.push({ ...mapperSource, evidence: { relation: "calls", filePath: impl.filePath, lineRange: [mapperCall.line, mapperCall.line] } });
              const statement = xmlStatements.get(mapper.name)?.get(mapperCall.methodName);
              if (statement) {
                const xmlSource = { ...statement, kind: "xml" };
                steps.push({ ...xmlSource, evidence: { relation: "mapsToXml", filePath: statement.filePath, lineRange: statement.lineRange } });
                appendModelUses(modelUses, modelUsesForXmlStatement(statement, xmlSource, models));
              }
            }
            chains.push({ id: controllerSource.name + "->" + implSource.name, steps, complete: steps.some(step => step.kind === "mapper") });
          }
        }
        const prelude = bindings
          .filter(binding => routeMatches(binding.pattern, route.path) && !binding.excludes.some(exclude => routeMatches(exclude, route.path)))
          .map(binding => ({
            ...binding,
            interceptor: byName.get(binding.interceptorName)
              ? sourceNode(binding.interceptorName, byName.get(binding.interceptorName).filePath, byName.get(binding.interceptorName).classLineRange, "interceptor")
              : null,
          }));
        endpoints.push({
          id: "spring:endpoint:" + controller.filePath + ":" + method.name + ":" + route.verb + ":" + route.path,
          verb: route.verb,
          path: route.path,
          methodName: method.name,
          filePath: controller.filePath,
          lineRange: route.lineRange,
          controller: controllerSource,
          chains,
          modelUses,
          prelude,
        });
      }
    }
    controllers.push({
      id: "spring:controller:" + controller.filePath,
      client: clientForController(controller),
      name: controller.name,
      filePath: controller.filePath,
      lineRange: controller.classLineRange,
      basePath: controller.basePath || "/",
      endpoints,
    });
  }

  const sourcePaths = new Set();
  for (const controller of controllers) {
    sourcePaths.add(controller.filePath);
    for (const endpoint of controller.endpoints) {
      sourcePaths.add(endpoint.filePath);
      endpoint.chains.forEach(chain => chain.steps.forEach(step => sourcePaths.add(step.filePath)));
      endpoint.modelUses.forEach(use => {
        sourcePaths.add(use.source.filePath);
        sourcePaths.add(use.model.filePath);
      });
      endpoint.prelude.forEach(item => {
        sourcePaths.add(item.config.filePath);
        if (item.interceptor) sourcePaths.add(item.interceptor.filePath);
      });
    }
  }

  const entryPoints = collectEntryPoints(infos, controllers);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    clients: [
      { id: "admin", name: "管理端", description: "/admin/**" },
      { id: "user", name: "用户端", description: "/user/**" },
      { id: "shared", name: "共享后端", description: "通知、配置与共享组件" },
    ],
    controllers: controllers.sort((a, b) => a.client.localeCompare(b.client) || a.name.localeCompare(b.name)),
    entryPoints,
    sourcePaths: [...sourcePaths].sort(),
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.dirname(fileURLToPath(import.meta.url));
  const index = buildSpringRuntimeIndex(projectRoot);
  const endpointCount = index.controllers.reduce((total, controller) => total + controller.endpoints.length, 0);
  if (!index.controllers.length || !endpointCount) throw new Error("No Spring controllers or endpoints were indexed");
  console.log(JSON.stringify({ controllers: index.controllers.length, endpoints: endpointCount }, null, 2));
}
