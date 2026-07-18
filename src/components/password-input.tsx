import * as React from "react";
import { Input } from "@/components/ui/input";

// Always-masked password field — no show/hide toggle, so the value can never
// be revealed on screen.
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => {
  return <Input type="password" className={className} ref={ref} {...props} />;
});
PasswordInput.displayName = "PasswordInput";
