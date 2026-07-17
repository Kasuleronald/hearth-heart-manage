import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Home,
  Users2,
  CalendarDays,
  UserCog,
  Church,
  LogOut,
  Settings,
  GraduationCap,
  HandCoins,
  BarChart3,
  Building2,
  Target,
  Handshake,
  Building,
  Receipt,
  ClipboardList,
  FileSearch,
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSession, isTierAFinanceLeader } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { Button } from "@/components/ui/button";

function getNav(cellTermPlural: string) {
  return [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "pastor", "cell_leader", "leader", "treasurer"] as const,
    },
    {
      title: "Members",
      url: "/members",
      icon: Users,
      roles: ["admin", "pastor", "cell_leader", "leader", "treasurer"] as const,
    },
    {
      title: "Households",
      url: "/households",
      icon: Home,
      roles: ["admin", "pastor", "cell_leader", "leader", "treasurer"] as const,
    },
    {
      title: cellTermPlural,
      url: "/cells",
      icon: Users2,
      roles: ["admin", "pastor", "cell_leader", "treasurer"] as const,
      financeTierAllowed: true,
    },
    {
      title: "Discipleship Classes",
      url: "/classes",
      icon: GraduationCap,
      roles: ["admin", "pastor", "cell_leader"] as const,
    },
    {
      title: "Departments",
      url: "/departments",
      icon: Building2,
      roles: ["admin", "pastor", "leader"] as const,
    },
    {
      title: "Events",
      url: "/events",
      icon: CalendarDays,
      roles: ["admin", "pastor", "cell_leader", "leader", "treasurer"] as const,
    },
    {
      title: "Projects",
      url: "/projects",
      icon: Target,
      roles: ["admin", "pastor", "cell_leader", "leader", "treasurer"] as const,
    },
    {
      title: "Givings",
      url: "/givings",
      icon: HandCoins,
      roles: ["admin", "pastor", "treasurer"] as const,
    },
    {
      title: "Partners",
      url: "/partners",
      icon: Handshake,
      roles: ["admin", "pastor", "treasurer"] as const,
      financeTierAllowed: true,
    },
    {
      title: "Expenses",
      url: "/expenses",
      icon: Receipt,
      roles: ["admin", "treasurer"] as const,
    },
    {
      title: "Requisitions",
      url: "/requisitions",
      icon: ClipboardList,
      roles: ["admin", "pastor", "treasurer", "leader"] as const,
      financeTierAllowed: true,
    },
    {
      title: "Cell Reports",
      url: "/cell-reports",
      icon: FileSearch,
      roles: ["admin", "pastor", "treasurer"] as const,
      financeTierAllowed: true,
    },
    {
      title: "Reports",
      url: "/reports",
      icon: BarChart3,
      roles: ["admin", "pastor", "treasurer"] as const,
    },
    { title: "Branches", url: "/branches", icon: Building, roles: ["admin"] as const },
    { title: "Users", url: "/users", icon: UserCog, roles: ["admin"] as const },
    { title: "Settings", url: "/settings", icon: Settings, roles: ["admin", "pastor"] as const },
  ];
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, signOut } = useSession();
  const { plural, leaderLabel } = useCellTerm();
  const nav = getNav(plural);
  if (!session) return null;
  const visible = nav.filter((n) => {
    if ((n.roles as readonly string[]).includes(session.role)) return true;
    if (n.financeTierAllowed && isTierAFinanceLeader(session.role, session.financeTier)) {
      return true;
    }
    return false;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary text-primary-foreground shadow-md">
            <Church className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-base font-semibold">My Church</span>
            <span className="text-xs text-sidebar-foreground/70">Administration</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{session.fullName}</div>
            <div className="truncate text-xs capitalize text-sidebar-foreground/70">
              {session.role === "cell_leader" ? leaderLabel : session.role.replace("_", " ")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ChangePasswordDialog userId={session.userId} />
            <Button
              size="icon"
              variant="ghost"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
