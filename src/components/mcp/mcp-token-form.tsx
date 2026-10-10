import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2 } from "lucide-react";
import { useTokenHandle } from "@/components/api-handle/token-handle";
import { useVaultHandle } from "@/components/api-handle/vault-handle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { VaultType } from "@/lib/types/vault";
import { buildMCPTokenScope, type MCPTokenOptions } from "./mcp-helpers";

export function MCPTokenForm({ onCreated }: { onCreated: (token: string) => void }) {
  const { t, i18n } = useTranslation();
  const text = (key: string, zh: string, en: string) => t(`ui.mcp.${key}`, { defaultValue: i18n.language.startsWith("zh") ? zh : en });
  const { handleCreateToken, isLoading } = useTokenHandle();
  const { handleVaultList } = useVaultHandle();
  const [vaults, setVaults] = useState<VaultType[]>([]);
  const [vaultState, setVaultState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [options, setOptions] = useState<MCPTokenOptions>({ writeNotes: false, files: "none", allVaults: false, vaults: [], expiredDays: 30 });
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setVaultState("loading");
    handleVaultList(list => { if (active) { setVaults(list); setVaultState("ready"); } }).catch(() => { if (active) setVaultState("error"); });
    return () => { active = false; };
  }, [handleVaultList, retry]);
  const valid = options.expiredDays >= 1 && Number.isInteger(options.expiredDays) && (options.allVaults || (vaultState === "ready" && options.vaults.length > 0));
  const create = async () => {
    setError(false);
    try {
      const scope = buildMCPTokenScope(options);
      const token = await handleCreateToken("MCP", "", scope.expiredDays, undefined, undefined, scope.protocol, scope.client, scope.functionScope, scope.vaults);
      if (!token) { setError(true); return; }
      onCreated(token);
    } catch { setError(true); }
  };
  return <section className="rounded-2xl bg-card p-5 sm:p-6 space-y-5">
    <div className="space-y-1"><h2 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />{text("createTitle", "创建 MCP 专用令牌", "Create an MCP token")}</h2>
      <p className="text-sm text-muted-foreground">{text("createDescription", "默认只读笔记。只授权 AI 客户端需要的内容。", "Notes are read-only by default. Grant only what your AI client needs.")}</p></div>
    <fieldset className="space-y-3" disabled={isLoading}>
      <legend className="text-sm font-medium mb-3">{text("permissions", "内容权限", "Content permissions")}</legend>
      <p className="text-sm text-muted-foreground">{text("readNotes", "读取笔记（始终开启）", "Read notes (always enabled)")}</p>
      <div className="flex items-center gap-2"><Checkbox id="mcp-write-notes" checked={options.writeNotes} onCheckedChange={checked => setOptions(prev => ({ ...prev, writeNotes: checked === true }))} /><Label htmlFor="mcp-write-notes">{text("writeNotes", "允许创建、修改和删除笔记", "Allow creating, editing, and deleting notes")}</Label></div>
      <div className="space-y-2"><Label htmlFor="mcp-files">{text("files", "附件权限", "Attachment permissions")}</Label>
        <select id="mcp-files" className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={options.files} onChange={event => setOptions(prev => ({ ...prev, files: event.target.value as MCPTokenOptions["files"] }))}>
          <option value="none">{text("filesNone", "不允许访问附件", "No attachment access")}</option><option value="read">{text("filesRead", "只读附件", "Read attachments")}</option><option value="write">{text("filesWrite", "读取、上传和删除附件", "Read, upload, and delete attachments")}</option>
        </select></div>
    </fieldset>
    <fieldset className="space-y-3" disabled={isLoading}>
      <legend className="text-sm font-medium mb-3">{text("vaults", "可访问的笔记库", "Allowed vaults")}</legend>
      <div className="flex items-center gap-2"><Checkbox id="mcp-all-vaults" checked={options.allVaults} onCheckedChange={checked => setOptions(prev => ({ ...prev, allVaults: checked === true }))} /><Label htmlFor="mcp-all-vaults">{text("allVaults", "允许所有笔记库（含将来新增的库）", "Allow all vaults (including future vaults)")}</Label></div>
      {!options.allVaults && <div className="rounded-xl bg-muted/40 p-3 space-y-3 max-h-56 overflow-y-auto">
        {vaultState === "loading" && <p className="text-sm text-muted-foreground" role="status">{text("vaultLoading", "正在加载笔记库…", "Loading vaults…")}</p>}
        {vaultState === "error" && <div className="space-y-2"><p className="text-sm text-destructive" role="alert">{text("vaultError", "无法加载笔记库，请重试。", "Could not load vaults. Try again.")}</p><Button variant="outline" size="sm" onClick={() => setRetry(prev => prev + 1)}>{text("retry", "重试", "Retry")}</Button></div>}
        {vaultState === "ready" && vaults.length === 0 && <p className="text-sm text-muted-foreground">{text("vaultEmpty", "暂无笔记库。请先创建库，或明确选择所有笔记库。", "No vaults yet. Create a vault first, or explicitly allow all vaults.")}</p>}
        {vaultState === "ready" && vaults.map(vault => <div key={vault.id} className="flex items-start gap-2"><Checkbox id={`mcp-vault-${vault.id}`} checked={options.vaults.includes(vault.vault)} onCheckedChange={checked => setOptions(prev => ({ ...prev, vaults: checked === true ? [...prev.vaults, vault.vault] : prev.vaults.filter(name => name !== vault.vault) }))} /><Label htmlFor={`mcp-vault-${vault.id}`} className="break-all leading-5">{vault.vault}</Label></div>)}
      </div>}
      {!options.allVaults && options.vaults.length === 0 && <p className="text-xs text-muted-foreground">{text("vaultRequired", "至少选择一个笔记库。空选不会授予所有库权限。", "Select at least one vault. An empty selection does not grant all-vault access.")}</p>}
    </fieldset>
    <div className="space-y-2"><Label htmlFor="mcp-expiry">{text("expiry", "有效期（天）", "Expires in (days)")}</Label><Input id="mcp-expiry" type="number" min={1} step={1} disabled={isLoading} value={Number.isNaN(options.expiredDays) ? "" : options.expiredDays} onChange={event => setOptions(prev => ({ ...prev, expiredDays: event.target.valueAsNumber }))} className="rounded-xl w-32" /></div>
    {error && <p role="alert" className="text-sm text-destructive">{text("createError", "创建失败，请检查权限与有效期后重试。", "Could not create the token. Check permissions and expiry, then retry.")}</p>}
    <Button disabled={!valid || isLoading} onClick={create} className="rounded-xl gap-2">{isLoading && <Loader2 className="h-4 w-4 animate-spin" />}{text("create", "创建令牌", "Create token")}</Button>
    <p className="text-xs text-muted-foreground">{text("manageTokens", "可在令牌管理中查看有效期、撤销或轮换此令牌。", "Use Token management to check expiry, revoke, or rotate this token.")}</p>
  </section>;
}
