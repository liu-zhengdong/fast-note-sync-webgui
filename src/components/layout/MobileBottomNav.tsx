import { Plug, Library, NotepadText, Trash2, Settings, Layout, type LucideIcon } from "lucide-react";
import { useAppStore, type ModuleId } from "@/stores/app-store";
import { NavItem } from "@/components/navigation/NavItem";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";


interface MobileBottomNavProps {
  /** 是否为管理员 */
  isAdmin: boolean
  /** 额外的 CSS 类名 */
  className?: string
}

/**
 * MobileBottomNav - 移动端底部导航栏
 *
 * 现代设计的水平导航条：
 * - 固定在视口底部
 * - 毛玻璃效果 (bg-card/80 backdrop-blur-lg)
 * - 圆角顶部 (rounded-t-2xl)
 * - 安全区域适配 (safe-area-inset-bottom)
 */
export function MobileBottomNav({ isAdmin, className }: MobileBottomNavProps) {
  const { t } = useTranslation()
  const { currentModule, setModule } = useAppStore()

  // 导航项配置
  const navItems: Array<{
    id: ModuleId
    icon: LucideIcon
    labelKey: string
    adminOnly?: boolean
  }> = [
      { id: "dashboard", icon: Layout, labelKey: "ui.nav.menuDashboard", adminOnly: true },
      { id: "vaults", icon: Library, labelKey: "ui.nav.menuVaults" },
      { id: "mcp", icon: Plug, labelKey: "ui.nav.menuMCP" },
      { id: "notes", icon: NotepadText, labelKey: "ui.nav.menuNotes" },
      { id: "trash", icon: Trash2, labelKey: "ui.nav.menuTrash" },
      { id: "settings", icon: Settings, labelKey: "ui.nav.menuSettings", adminOnly: true },
    ]

  // 过滤出可见的导航项
  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin
  )

  const handleNavClick = (id: ModuleId) => {
    setModule(id)
  }

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-card/80 backdrop-blur-lg",
        "border-t border-border/50",
        "rounded-t-2xl",
        // 安全区域适配
        "pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      <div className="flex items-center justify-around h-16 px-4">
        {visibleItems.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={t(item.labelKey)}
            isActive={currentModule === item.id}
            onClick={() => handleNavClick(item.id)}
            tooltipSide="top"
            tooltipDelay={800}
          />
        ))}
      </div>
    </nav>
  )
}
