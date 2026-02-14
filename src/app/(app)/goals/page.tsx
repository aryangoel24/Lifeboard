"use client";

import { useEffect, useState } from "react";
import { getProfile, updateGoals } from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import type { Profile } from "@/types/database";

export default function GoalsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await updateGoals(formData);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Goals updated!");
      getProfile().then(setProfile);
    }
    setLoading(false);
  }

  if (!profile) {
    return <p className="text-muted-foreground text-center py-8">Loading...</p>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Daily Goals</h1>
      <Card>
        <CardHeader>
          <CardTitle>Nutrition Targets</CardTitle>
          <CardDescription>
            Set your daily macro targets. These are used to track your progress
            on the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="daily_calories_goal">Daily Calories</Label>
              <Input
                id="daily_calories_goal"
                name="daily_calories_goal"
                type="number"
                min={0}
                defaultValue={profile.daily_calories_goal}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_protein_goal">Daily Protein (g)</Label>
              <Input
                id="daily_protein_goal"
                name="daily_protein_goal"
                type="number"
                min={0}
                defaultValue={profile.daily_protein_goal}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_carbs_goal">Daily Carbs (g)</Label>
              <Input
                id="daily_carbs_goal"
                name="daily_carbs_goal"
                type="number"
                min={0}
                defaultValue={profile.daily_carbs_goal}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_fat_goal">Daily Fat (g)</Label>
              <Input
                id="daily_fat_goal"
                name="daily_fat_goal"
                type="number"
                min={0}
                defaultValue={profile.daily_fat_goal}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Save goals"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
