import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getOrgPublicInfoFn, submitMemberRegistrationFn } from "@/server/member-registrations";
import { MONTH_NAMES } from "@/lib/db";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/register/$organizationId")({
  ssr: false,
  component: RegisterPage,
});

function RegisterPage() {
  const { organizationId } = Route.useParams();
  const orgQuery = useQuery({
    queryKey: ["org-public-info", organizationId],
    queryFn: () => getOrgPublicInfoFn({ data: { organizationId } }),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | undefined>(undefined);
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      submitMemberRegistrationFn({
        data: {
          organizationId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          address: address.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          gender,
          birthMonth: birthMonth ? Number(birthMonth) : undefined,
          birthDay: birthDay ? Number(birthDay) : undefined,
          birthYear: birthYear ? Number(birthYear) : undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: () => setSubmitted(true),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  function submit() {
    if (submitMutation.isPending) return;
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (Boolean(birthMonth) !== Boolean(birthDay)) {
      toast.error("Enter both a birth month and day, or leave both blank");
      return;
    }
    submitMutation.mutate();
  }

  if (orgQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!orgQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="font-display text-lg font-semibold">This link isn't available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The registration link may be out of date. Please check with the church for the current
              one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h1 className="font-display text-lg font-semibold">Thank you!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your registration with {orgQuery.data.name} has been submitted for review. Someone
              will follow up with you soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg border-border/60 shadow-xl">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <AppLogo className="h-10 w-10 rounded-2xl object-contain" />
            <div>
              <div className="font-display text-xl font-semibold">{orgQuery.data.name}</div>
              <div className="text-xs text-muted-foreground">Member registration</div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  First name <span className="text-destructive">*</span>
                </Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Last name <span className="text-destructive">*</span>
                </Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Address <span className="text-destructive">*</span>
              </Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select
                value={gender ?? ""}
                onValueChange={(v) => setGender((v || undefined) as typeof gender)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={birthMonth || "none"}
                  onValueChange={(v) => setBirthMonth(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={name} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={birthDay || "none"}
                  onValueChange={(v) => setBirthDay(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                className="mt-2"
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                placeholder="Year (optional)"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anything you'd like us to know?</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={submitMutation.isPending}>
              {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit registration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
