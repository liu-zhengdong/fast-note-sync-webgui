import { Info, GitBranch, Tag, RefreshCw, AlertCircle, CheckCircle, ExternalLink, Loader2, ArrowUpCircle, Rocket, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useUpdateCheck } from "@/components/api-handle/use-update-check";
import { useVersion } from "@/components/api-handle/use-version";
import { addCacheBuster } from "@/lib/utils/cache-buster";
import { buildApiHeaders } from "@/lib/utils/api-headers";
import { useConfirmDialog } from "@/components/context/confirm-dialog-context";
import { toast } from "@/components/common/Toast";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/context/theme-context";
import { transformObsidianSyntax } from "@/components/note/markdown-editor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import env from "@/env.ts";


const getSafeHttpUrl = (url?: string | null): string | null => {
    if (!url) return null
    try {
        const parsedUrl = new URL(url)
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? url : null
    } catch {
        return null
    }
}

export function VersionOverview({ showUpgrade = true, children }: { showUpgrade?: boolean, children?: React.ReactNode }) {
    const { t } = useTranslation()
    const { versionInfo, isLoading: versionLoading } = useVersion()
    const { checkUpdate, isChecking, updateResult } = useUpdateCheck()
    const [isUpgrading, setIsUpgrading] = useState(false)
    const upgradePollTimerRef = useRef<number | null>(null)
    const upgradePollCancelledRef = useRef(false)
    const { resolvedTheme } = useTheme()
    const { openConfirmDialog } = useConfirmDialog()

    const highlightClass = resolvedTheme === "dark"
        ? "[&_.hljs-comment]:text-zinc-500 [&_.hljs-quote]:text-zinc-500 [&_.hljs-keyword]:text-sky-300 [&_.hljs-selector-tag]:text-sky-300 [&_.hljs-literal]:text-sky-300 [&_.hljs-title]:text-emerald-300 [&_.hljs-section]:text-emerald-300 [&_.hljs-name]:text-emerald-300 [&_.hljs-string]:text-amber-300 [&_.hljs-attr]:text-amber-300 [&_.hljs-template-tag]:text-amber-300 [&_.hljs-number]:text-fuchsia-300 [&_.hljs-built_in]:text-violet-300 [&_.hljs-type]:text-violet-300"
        : "[&_.hljs-comment]:text-zinc-500 [&_.hljs-quote]:text-zinc-500 [&_.hljs-keyword]:text-blue-600 [&_.hljs-selector-tag]:text-blue-600 [&_.hljs-literal]:text-blue-600 [&_.hljs-title]:text-green-700 [&_.hljs-section]:text-green-700 [&_.hljs-name]:text-green-700 [&_.hljs-string]:text-amber-700 [&_.hljs-attr]:text-amber-700 [&_.hljs-template-tag]:text-amber-700 [&_.hljs-number]:text-purple-700 [&_.hljs-built_in]:text-purple-700 [&_.hljs-type]:text-purple-700";

    useEffect(() => {
        return () => {
            upgradePollCancelledRef.current = true
            if (upgradePollTimerRef.current !== null) {
                window.clearTimeout(upgradePollTimerRef.current)
            }
        }
    }, [])

    const safeVersionNewLink = getSafeHttpUrl(versionInfo?.versionNewLink)
    const safeReleaseUrl = getSafeHttpUrl(updateResult?.releaseUrl || versionInfo?.versionNewLink)

    const handleCheckUpdate = async () => {
        if (versionInfo?.version) {
            const result = await checkUpdate(versionInfo.version)
            if (result) {
                toast.success(result.hasUpdate ? t("ui.system.newVersionAvailable") : t("ui.system.alreadyLatest"))
            }
        }
    }

    const handleUpgrade = async () => {
        const token = localStorage.getItem("token")
        if (!token) return

        upgradePollCancelledRef.current = false
        if (upgradePollTimerRef.current !== null) {
            window.clearTimeout(upgradePollTimerRef.current)
            upgradePollTimerRef.current = null
        }

        setIsUpgrading(true)
        try {
            const response = await fetch(addCacheBuster(env.API_URL + "/api/admin/upgrade?version=latest"), {
                headers: buildApiHeaders({
                    token,
                    includeContentType: false,
                    includeDomain: false,
                }),
            })
            const res = await response.json()
            if (res.code === 0 || (res.code < 100 && res.code > 0)) {
                toast.success(t("ui.system.upgradeSuccess"))

                const pollStartedAt = Date.now()
                let hasGoneDown = false
                const pollHealth = async () => {
                    if (upgradePollCancelledRef.current) {
                        return
                    }

                    if (Date.now() - pollStartedAt >= 5 * 60 * 1000) {
                        toast.error(t("ui.system.upgradeRefreshTimeout"))
                        setIsUpgrading(false)
                        return
                    }

                    try {
                        const controller = new AbortController()
                        const timeoutId = setTimeout(() => controller.abort(), 5000)

                        const healthResponse = await fetch(addCacheBuster(env.API_URL + "/api/health"), {
                            signal: controller.signal
                        })
                        clearTimeout(timeoutId)

                        if (healthResponse.ok) {
                            if (hasGoneDown) {
                                window.location.reload()
                                return
                            }
                            // 如果服务仍在运行（升级尚未开始导致服务停止），我们继续等待它停机
                        } else {
                            // 接口返回非 200，认为服务正在关闭
                            hasGoneDown = true
                        }
                    } catch {
                        // 无法连接或请求超时通常意味着服务已停止运行，正在重启
                        hasGoneDown = true
                    }

                    upgradePollTimerRef.current = window.setTimeout(() => {
                        void pollHealth()
                    }, 2000)
                }

                void pollHealth()
            } else {
                toast.error(res.message || t("ui.system.upgradeFailed"))
                setIsUpgrading(false)
            }
        } catch {
            toast.error(t("ui.system.upgradeFailed"))
            setIsUpgrading(false)
        }
    }

    const handleUpgradeClick = () => {
        const currentVersion = versionInfo?.version || "Unknown"
        const targetVersion = updateResult?.latestVersion || versionInfo?.versionNewName || versionInfo?.version || "Unknown"
        const changelog = updateResult?.releaseNotesContent || versionInfo?.versionNewChangelogContent || ""
        const history = updateResult?.versionHistory || versionInfo?.versionHistory

        openConfirmDialog(
            t("ui.system.newVersionAvailable"),
            "upgrade",
            () => handleUpgrade(),
            <div className="space-y-4 pt-2">
                <div className="flex items-center justify-center gap-6 py-4 bg-muted/30 rounded-xl border border-border/50">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("ui.system.currentVersion")}</span>
                        <code className="px-3 py-1 bg-background rounded-lg text-sm font-mono border border-border shadow-sm">{currentVersion}</code>
                    </div>
                    <div className="flex flex-col items-center justify-center pt-4">
                        <ArrowRight className="h-5 w-5 text-primary animate-in slide-in-from-left-2 duration-700 repeat-infinite" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] text-primary uppercase font-bold tracking-wider">{t("ui.system.upgrade")}</span>
                        <code className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-sm font-mono font-bold border border-primary/20 shadow-sm">{targetVersion}</code>
                    </div>
                </div>

                {changelog && (
                    <div className="space-y-2">
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-2 px-1">
                             <Rocket className="h-3 w-3" />
                             {t("ui.system.viewChangelog")}
                        </div>
                        <div className={cn("text-xs text-muted-foreground bg-muted/50 p-4 rounded-xl border border-border max-h-80 overflow-y-auto leading-relaxed shadow-inner", highlightClass)}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                components={{
                                    h1: ({ ...props }) => <h1 className="text-lg font-bold mt-4 mb-2 text-foreground" {...props} />,
                                    h2: ({ ...props }) => <h2 className="text-md font-bold mt-3 mb-1 text-foreground" {...props} />,
                                    h3: ({ ...props }) => <h3 className="text-sm font-bold mt-2 mb-1 text-foreground" {...props} />,
                                    h4: ({ ...props }) => <h4 className="text-xs font-bold mt-2 mb-1 text-foreground" {...props} />,
                                    p: ({ ...props }) => <p className="my-1.5" {...props} />,
                                    ul: ({ ...props }) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
                                    li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                                    code: ({ ...props }) => <code className="bg-muted-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono" {...props} />,
                                    a: ({ ...props }) => <a className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                                    blockquote: ({ ...props }) => <blockquote className="border-l-4 border-primary/30 pl-3 italic text-muted-foreground/80 my-2" {...props} />,
                                }}
                            >
                                {transformObsidianSyntax(changelog, "", {}, "")}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}

                {history && history.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-2 px-1">
                             <Rocket className="h-3 w-3" />
                             {t("ui.system.versionHistory")}
                        </div>
                        <div className="space-y-2">
                            {history.map((item, idx) => (
                                <CollapsibleVersionItem 
                                    key={idx} 
                                    version={item.version} 
                                    changelog={item.changelogContent} 
                                    highlightClass={highlightClass}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>,
            "max-w-4xl"
        )
    }

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 custom-shadow">
            <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
                <Info className="h-5 w-5" />
                {t("ui.system.versionInfo")}
            </h2>
            <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground font-medium">
                        <GitBranch className="h-4 w-4" />
                        <span>{t("ui.system.repo")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                    <a href="https://github.com/liu-zhengdong/fast-note-sync-service" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-37.5 sm:max-w-none">
                        {t("ui.system.githubRepo")}
                    </a>
                </div>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground font-medium">
                        <Tag className="h-4 w-4" />
                        <span>{t("ui.system.currentVersion")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {versionLoading ? (
                            <code className="font-mono text-muted-foreground">{t("ui.common.loading")}</code>
                        ) : (
                            <>
                                {safeVersionNewLink ? (
                                    <a
                                        href={safeVersionNewLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary hover:underline"
                                    >
                                        {versionInfo?.version}
                                    </a>
                                ) : (
                                    <code className="font-mono text-muted-foreground">
                                        {versionInfo?.version || t("ui.common.unknown")}
                                    </code>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="border-t border-border/50" />
            <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-muted-foreground font-medium">
                        <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
                        <span>{t("ui.system.checkUpdate")}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleCheckUpdate} disabled={isChecking || versionLoading || !versionInfo?.version} className="rounded-xl px-3">
                        {isChecking ? t("ui.system.checking") : t("ui.system.checkNow")}
                    </Button>
                </div>
                {updateResult || versionInfo?.versionIsNew ? (
                    <div className={`rounded-xl p-4 ${(updateResult?.hasUpdate || versionInfo?.versionIsNew) ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}>
                        <div className="flex-1 space-y-2">
                            <div className="flex items-start gap-3">
                                {(updateResult?.hasUpdate || versionInfo?.versionIsNew) ? <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" /> : <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />}
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-sm font-medium">{(updateResult?.hasUpdate || versionInfo?.versionIsNew) ? t("ui.system.newVersionAvailable") : t("ui.system.alreadyLatest")}</span>
                                    <div className="flex items-center gap-2">
                                        {(updateResult?.latestVersion || versionInfo?.versionNewName || versionInfo?.version) && <code className="text-xs font-mono bg-background px-2 py-0.5 rounded">{updateResult?.latestVersion || versionInfo?.versionNewName || versionInfo?.version}</code>}
                                        {(updateResult?.hasUpdate || versionInfo?.versionIsNew) && safeReleaseUrl && (
                                            <a href={safeReleaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                                {t("ui.system.viewRelease")} <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                        {showUpgrade && (updateResult?.hasUpdate || versionInfo?.versionIsNew) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={isUpgrading}
                                                onClick={handleUpgradeClick}
                                                className="h-6 px-2 text-xs text-primary hover:bg-primary/10 rounded-md gap-1 ml-1 relative group transition-all duration-300"
                                            >
                                                {isUpgrading ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <ArrowUpCircle className="h-3 w-3 group-hover:scale-110 transition-transform duration-300" />
                                                )}
                                                <span className="relative">
                                                    {isUpgrading ? t("ui.system.upgrading") : t("ui.system.upgrade")}
                                                    {!isUpgrading && (
                                                        <span className="absolute -top-1 -right-1.5 flex h-1.5 w-1.5">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500 border border-background"></span>
                                                        </span>
                                                    )}
                                                </span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {(updateResult?.releaseNotesContent || versionInfo?.versionNewChangelogContent) && (
                                    <div className={cn("text-xs text-muted-foreground bg-background/50 p-3 rounded-lg border border-border/50 max-h-60 overflow-y-auto leading-relaxed", highlightClass)}>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                            components={{
                                                h1: ({ ...props }) => <h1 className="text-lg font-bold mt-4 mb-2 text-foreground" {...props} />,
                                                h2: ({ ...props }) => <h2 className="text-md font-bold mt-3 mb-1 text-foreground" {...props} />,
                                                h3: ({ ...props }) => <h3 className="text-sm font-bold mt-2 mb-1 text-foreground" {...props} />,
                                                h4: ({ ...props }) => <h4 className="text-xs font-bold mt-2 mb-1 text-foreground" {...props} />,
                                                p: ({ ...props }) => <p className="my-1" {...props} />,
                                                ul: ({ ...props }) => <ul className="list-disc pl-4 my-2" {...props} />,
                                                li: ({ ...props }) => <li className="my-0.5" {...props} />,
                                                code: ({ ...props }) => <code className="bg-muted px-1 rounded text-[10px]" {...props} />,
                                                a: ({ ...props }) => <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                            }}
                                        >
                                            {transformObsidianSyntax(updateResult?.releaseNotesContent || versionInfo?.versionNewChangelogContent || "", "", {}, "")}
                                        </ReactMarkdown>
                                    </div>
                                )}
                                {(() => {
                                    const history = updateResult?.versionHistory || versionInfo?.versionHistory;
                                    return history && history.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-border/40 space-y-2">
                                            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider px-1">
                                                {t("ui.system.versionHistory")}
                                            </div>
                                            <div className="space-y-2">
                                                {history.map((item, idx) => (
                                                    <CollapsibleVersionItem 
                                                        key={idx} 
                                                        version={item.version} 
                                                        changelog={item.changelogContent} 
                                                        highlightClass={highlightClass}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
            {children && (
                <>
                    <div className="border-t border-border" />
                    {children}
                </>
            )}
        </div>
    )
}

function CollapsibleVersionItem({ version, changelog, highlightClass }: { version: string, changelog: string, highlightClass: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const { t } = useTranslation()

    return (
        <div className="border border-border/60 rounded-xl overflow-hidden bg-muted/20">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium hover:bg-muted/40 transition-colors text-left cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-background border border-border/80 px-2 py-0.5 rounded text-foreground">
                        v{version}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                        {t("ui.system.clickToExpand")}
                    </span>
                </div>
                <div className="text-muted-foreground">
                    {isOpen ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </div>
            </button>
            
            {isOpen && (
                <div className={cn("border-t border-border/40 p-4 text-xs text-muted-foreground bg-background leading-relaxed max-h-60 overflow-y-auto", highlightClass)}>
                    {changelog ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, rehypeHighlight]}
                            components={{
                                h1: ({ ...props }) => <h1 className="text-sm font-bold mt-3 mb-1.5 text-foreground" {...props} />,
                                h2: ({ ...props }) => <h2 className="text-xs font-bold mt-2.5 mb-1 text-foreground" {...props} />,
                                h3: ({ ...props }) => <h3 className="text-xs font-semibold mt-2 mb-1 text-foreground" {...props} />,
                                p: ({ ...props }) => <p className="my-1" {...props} />,
                                ul: ({ ...props }) => <ul className="list-disc pl-4 my-1.5 space-y-0.5" {...props} />,
                                li: ({ ...props }) => <li className="my-0.5" {...props} />,
                                code: ({ ...props }) => <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-foreground" {...props} />,
                                a: ({ ...props }) => <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                            }}
                        >
                            {transformObsidianSyntax(changelog, "", {}, "")}
                        </ReactMarkdown>
                    ) : (
                        <p className="text-muted-foreground/50 text-[10px] italic">暂无更新说明</p>
                    )}
                </div>
            )}
        </div>
    )
}
