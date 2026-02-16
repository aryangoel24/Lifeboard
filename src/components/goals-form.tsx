"use client";

import { useState } from "react";
import { updateGoals } from "@/lib/actions/goals";
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

interface GoalsFormProps {
    profile: Profile;
}

export function GoalsForm({ profile }: GoalsFormProps) {
    const [loading, setLoading] = useState(false);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        const result = await updateGoals(formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Goals updated!");
        }
        setLoading(false);
    }

    return (
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
                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Weight
                            </span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="goal_weight">Goal Weight (kg)</Label>
                        <Input
                            id="goal_weight"
                            name="goal_weight"
                            type="number"
                            min={0}
                            step={0.1}
                            defaultValue={profile.goal_weight ?? ""}
                            placeholder="e.g. 70"
                        />
                    </div>
                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Habits
                            </span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="creatine_goal">Creatine Servings / Day</Label>
                        <Input
                            id="creatine_goal"
                            name="creatine_goal"
                            type="number"
                            min={1}
                            max={10}
                            defaultValue={profile.creatine_goal}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="gym_weekly_goal">Gym Days / Week</Label>
                        <Input
                            id="gym_weekly_goal"
                            name="gym_weekly_goal"
                            type="number"
                            min={1}
                            max={7}
                            defaultValue={profile.gym_weekly_goal}
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Saving..." : "Save goals"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
