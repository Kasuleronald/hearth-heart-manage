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
} from "lucide-react";
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
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const nav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "pastor", "cell_leader"] as const },
  { title: "Members", url: "/members", icon: Users, roles: ["admin", "pastor", "cell_leader"] as const },
  { title: "Households", url: "/households", icon: Home, roles: ["admin", "pastor"] as const },
  { title: "Cell Fellowships", url: "/cells", icon: Users2, roles: ["admin", "pastor", "cell_leader"] as const },
  { title: "Events", url: "/events", icon: CalendarDays, roles: ["admin", "pastor", "cell_leader"] as const },
  { title: "Users", url: "/users", icon: UserCog, roles: ["admin"] as const },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, signOut } = useSession();
  if (!session) return null;
  const visible = nav.filter((n) => (n.roles as readonly string[]).includes(session.role));

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
              {session.role.replace("_", " ")}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={signOut}
            title="Sign out"
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
