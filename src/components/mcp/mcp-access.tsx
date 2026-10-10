import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Loader2, PlugZap } from "lucide-react";
import env from "@/env";
import { buildApiHeaders } from "@/lib/utils/api-headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MCPTokenForm } from "./mcp-token-form";
import { MCPConnectionError, mcpConfigSnippet, resolveMCPEndpoint, testMCPConnection, type MCPTestResult } from "./mcp-helpers";

export function MCPAccess() {
  const { t, i18n } = useTranslation();
  const text = (key: string, zh: string, en: string) => t(`ui.mcp.${key}`, { defaultValue: i18n.language.startsWith("zh") ? zh : en });
  let endpoint = "";
  try { endpoint = resolveMCPEndpoint(env.API_URL, window.location.href); } catch { /* Render actionable endpoint error below. */ }
  const [createdToken, setCreatedToken] = useState("");
  const [suppliedToken, setSuppliedToken] = useState("");
  const [useCreated, setUseCreated] = useState(true);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MCPTestResult | null>(null);
  const [testError, setTestError] = useState<MCPConnectionError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);
  const copy = async (value: string, name: string) => {
    setCopyError(false);
    try { await navigator.clipboard.writeText(value); setCopied(name); } catch { setCopyError(true); }
  };
  const invalidate = () => { sequence.current++; controller.current?.abort(); setTesting(false); setTestResult(null); setTestError(null); };
  const test = async () => {
    invalidate();
    const run = sequence.current;
    controller.current = new AbortController();
    setTesting(true);
    try {
      const result = await testMCPConnection(endpoint, useCreated && createdToken ? createdToken : suppliedToken, buildApiHeaders(), { signal: controller.current.signal });
      if (run === sequence.current) setTestResult(result);
    } catch (error) { if (run === sequence.current) setTestError(error instanceof MCPConnectionError ? error : new MCPConnectionError("network")); }
    finally { if (run === sequence.current) setTesting(false); }
  };
  const errorMessage = (error: MCPConnectionError) => {
    switch (error.kind) {
      case "http": return `${text("httpError", "服务器拒绝请求。请检查令牌、MCP 权限与服务地址。HTTP 状态码：", "The server rejected the request. Check your token, MCP permissions, and endpoint. HTTP status:")} ${error.code}`;
      case "auth": return text("authError", "令牌无效或已过期。请创建新的 MCP 令牌后重试。", "The token is invalid or expired. Create a new MCP token and try again.");
      case "forbidden": return text("permissionError", "令牌权限或使用限制拒绝了连接。请检查 MCP 协议、客户端及其他令牌限制。", "Token permissions or usage restrictions rejected the connection. Check the MCP protocol, client, and other token restrictions.");
      case "application": return `${text("applicationError", "服务器无法完成请求。错误码：", "The server could not complete the request. Code:")} ${error.code ?? "—"}`;
      case "rpc": return `${text("rpcError", "MCP 返回协议错误。错误码：", "MCP returned a protocol error. Code:")} ${error.code ?? "—"}`;
      case "timeout": return text("timeoutError", "连接超时。请检查网络和服务器是否可用。", "The connection timed out. Check your network and server.");
      case "invalidResponse": return text("responseError", "服务器响应不符合 MCP 协议。请检查地址和服务版本。", "The response does not match the MCP protocol. Check the endpoint and server version.");
      case "token": return text("tokenRequired", "请输入 MCP 令牌。", "Enter an MCP token.");
      default: return text("networkError", "无法连接。请检查网络、HTTPS 证书及跨域设置。", "Could not connect. Check the network, HTTPS certificate, and cross-origin settings.");
    }
  };
  const snippet = endpoint ? mcpConfigSnippet(endpoint) : "";
  return <div className="mx-auto max-w-4xl space-y-6 pb-8">
    <header className="space-y-2"><h1 className="text-2xl font-semibold flex items-center gap-3"><PlugZap className="h-7 w-7 text-primary" />{text("title", "MCP 接入", "MCP access")}</h1><p className="text-muted-foreground">{text("description", "让支持 MCP 的 AI 客户端连接你的笔记。创建专用令牌，再把地址和令牌填入客户端。", "Connect an MCP-compatible AI client to your notes. Create a dedicated token, then add the endpoint and token to your client.")}</p></header>
    <section className="rounded-2xl bg-card p-5 sm:p-6 space-y-3"><Label htmlFor="mcp-endpoint">{text("endpoint", "MCP 服务地址", "MCP endpoint")}</Label><div className="flex gap-2"><Input id="mcp-endpoint" value={endpoint} readOnly className="rounded-xl font-mono text-xs" /><Button variant="outline" disabled={!endpoint} className="rounded-xl shrink-0 gap-2" onClick={() => copy(endpoint, "endpoint")}>{copied === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{text("copy", "复制", "Copy")}</Button></div>
      {!endpoint && <p role="alert" className="text-sm text-destructive">{text("endpointError", "API 地址无效。请在设置中填写 HTTP 或 HTTPS 服务地址。", "The API URL is invalid. Set an HTTP or HTTPS server URL in Settings.")}</p>}
      <p className="text-xs text-muted-foreground">{text("transport", "使用 Streamable HTTP。远程客户端需能访问此地址。", "Uses Streamable HTTP. Your remote client must be able to reach this endpoint.")}</p>
    </section>
    <MCPTokenForm onCreated={token => { invalidate(); setCreatedToken(token); setUseCreated(true); setCopied(""); }} />
    {createdToken && <section className="rounded-2xl bg-primary/5 p-5 sm:p-6 space-y-3"><h2 className="font-semibold">{text("created", "令牌已创建", "Token created")}</h2><p className="text-sm text-muted-foreground">{text("tokenMemory", "令牌仅保存在当前页面内存中。请立即复制；离开或刷新页面后无法在此找回。", "The token is held only in this page's memory. Copy it now; it cannot be recovered here after leaving or refreshing.")}</p><div className="flex items-center gap-3"><span className="font-mono tracking-wider">••••••••••••••••••••</span><Button variant="outline" className="rounded-xl gap-2" onClick={() => copy(createdToken, "token")}>{copied === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{text("copyToken", "复制令牌", "Copy token")}</Button><Button variant="ghost" onClick={() => { invalidate(); setCreatedToken(""); setUseCreated(false); setCopied(""); }}>{text("clearToken", "清除", "Clear")}</Button></div></section>}
    <section className="rounded-2xl bg-card p-5 sm:p-6 space-y-4"><div className="space-y-1"><h2 className="text-lg font-semibold">{text("testTitle", "测试连接", "Test connection")}</h2><p className="text-sm text-muted-foreground">{text("testDescription", "只初始化连接并读取工具列表，不调用工具，也不修改笔记。", "Initializes the connection and reads the tool list. It does not call tools or change notes.")}</p></div>
      {createdToken && <div className="flex flex-wrap gap-2"><Button size="sm" variant={useCreated ? "default" : "outline"} onClick={() => { invalidate(); setUseCreated(true); }}>{text("useCreated", "使用刚创建的令牌", "Use the new token")}</Button><Button size="sm" variant={!useCreated ? "default" : "outline"} onClick={() => { invalidate(); setUseCreated(false); }}>{text("useExisting", "使用其他令牌", "Use another token")}</Button></div>}
      {(!createdToken || !useCreated) && <div className="space-y-2"><Label htmlFor="mcp-test-token">{text("testToken", "MCP 令牌", "MCP token")}</Label><Input id="mcp-test-token" type="password" autoComplete="off" spellCheck={false} value={suppliedToken} onChange={event => { invalidate(); setSuppliedToken(event.target.value); }} placeholder={text("tokenPlaceholder", "粘贴 MCP 专用令牌", "Paste a dedicated MCP token")} className="rounded-xl" /></div>}
      <Button className="rounded-xl gap-2" disabled={testing || !endpoint || !(useCreated && createdToken ? createdToken : suppliedToken).trim()} onClick={test}>{testing && <Loader2 className="h-4 w-4 animate-spin" />}{testing ? text("testing", "正在测试…", "Testing…") : text("test", "测试连接", "Test connection")}</Button>
      {testError && <p role="alert" className="text-sm text-destructive">{errorMessage(testError)}</p>}
      {testResult && <div role="status" className="rounded-xl bg-muted/50 p-4 space-y-2"><p className="font-medium flex items-center gap-2"><Check className="h-4 w-4 text-green-600" />{text("connected", "连接成功", "Connected")}</p><p className="text-sm break-all">{testResult.serverName} · {testResult.protocolVersion} · {testResult.tools.length} {text("tools", "个工具", "tools")}</p><details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{text("toolDetails", "查看工具列表", "View tool list")}</summary><ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">{testResult.tools.map((tool, index) => <li key={`${tool}-${index}`} className="font-mono text-xs break-all">{tool}</li>)}</ul></details></div>}
    </section>
    <section className="rounded-2xl bg-card p-5 sm:p-6 space-y-3"><div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{text("configTitle", "客户端配置示例", "Client configuration example")}</h2><Button variant="outline" size="sm" disabled={!endpoint} className="rounded-xl gap-2" onClick={() => copy(snippet, "config")}>{copied === "config" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{text("copyConfig", "复制配置", "Copy config")}</Button></div><p className="text-sm text-muted-foreground">{text("configDescription", "将 <MCP_TOKEN> 替换为专用令牌。客户端配置格式可能不同，请按其说明填写 URL 与 Authorization 请求头。", "Replace <MCP_TOKEN> with your dedicated token. Client formats vary; follow your client's instructions for the URL and Authorization header.")}</p><pre className="rounded-xl bg-muted/50 p-4 overflow-x-auto text-xs leading-relaxed"><code>{snippet}</code></pre></section>
    {copyError && <p role="alert" className="text-sm text-destructive">{text("copyError", "复制失败，请检查浏览器剪贴板权限。", "Copy failed. Check your browser's clipboard permission.")}</p>}
  </div>;
}
