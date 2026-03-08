"use client";

import { useState, useMemo } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
    TrendingUp,
    Download,
    BarChart3,
    PieChart,
    Scale,
    Pill,
} from "lucide-react";
import type { WeightEntry, HabitEntry, CustomHabit } from "@/types/database";
import type { WeightStats, WeightCalorieData, TDEEResponse } from "@/lib/actions/weight";
import type { DebtState } from "@/lib/actions/habit-debt";
import { payOffTotalDebt } from "@/lib/actions/habit-debt";
import { formatCents, getHabitDisplayName, getMondayOfWeek } from "@/lib/habit-debt-utils";
import { TDEECard } from "@/components/tdee-card";
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart as RechartsPieChart,
    Pie,
    Cell,
    Bar,
    ComposedChart,
    ReferenceLine,
} from "recharts";
import { exportEntriesCsv } from "@/lib/actions/analytics";
import { subDays, format } from "date-fns";
import type { DailyMacroData, MealBreakdown } from "@/lib/actions/analytics";
import type { HabitWeeklyStats } from "@/lib/habit-utils";
import { computeSingleHabitTrendData } from "@/lib/habit-utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const PIE_COLORS = ["#f59e0b", "#3b82f6", "#8b5cf6", "#10b981"];
const MEAL_LABELS: Record<string, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
};

interface AnalyticsClientProps {
    trends: DailyMacroData[];
    weeklySummary: {
        avgCalories: number;
        avgProtein: number;
        avgCarbs: number;
        avgFat: number;
        totalEntries: number;
        daysLogged: number;
        bestDay: string | null;
        worstDay: string | null;
    } | null;
    mealBreakdown: MealBreakdown[];
    weightEntries?: WeightEntry[];
    weightStats?: WeightStats;
    weightCalories?: WeightCalorieData[];
    tdee?: TDEEResponse;
    habitWeeklyStats?: HabitWeeklyStats;
    habitEntries?: HabitEntry[];
    customHabits?: CustomHabit[];
    customHabitEntries?: HabitEntry[];
    creatineGoal?: number;
    debtState?: DebtState;
    today?: string;
}

export function AnalyticsClient({
    trends,
    weeklySummary,
    mealBreakdown,
    weightEntries = [],
    weightStats,
    weightCalories = [],
    tdee,
    habitWeeklyStats,
    habitEntries = [],
    customHabits = [],
    customHabitEntries = [],
    creatineGoal = 2,
    debtState,
    today,
}: AnalyticsClientProps) {
    const [exporting, setExporting] = useState(false);
    const [payingOff, setPayingOff] = useState(false);
    const [selectedHabitId, setSelectedHabitId] = useState<string>("creatine");

    const chartData = useMemo(() =>
        trends.map((d) => ({
            ...d,
            date: format(new Date(d.date + "T00:00:00"), "MM/dd"),
        })),
        [trends]
    );

    const pieData = useMemo(() =>
        mealBreakdown.map((d) => ({
            name: MEAL_LABELS[d.category] || d.category,
            value: d.calories,
            percentage: d.percentage,
        })),
        [mealBreakdown]
    );

    const weightChartData = useMemo(() =>
        weightEntries.map((e) => ({
            date: format(new Date(e.logged_at + "T00:00:00"), "MMM d"),
            weight: e.weight,
        })),
        [weightEntries]
    );

    const weightCalorieChartData = useMemo(() =>
        weightCalories.map((d) => ({
            date: format(new Date(d.date + "T00:00:00"), "MMM d"),
            weight: d.weight,
            calories: d.calories,
        })),
        [weightCalories]
    );

    const habitOptions = useMemo(() => [
        { id: "creatine", label: "Creatine", isCustom: false, goal: creatineGoal },
        { id: "magnesium", label: "Magnesium", isCustom: false, goal: 1 },
        { id: "gym", label: "Gym", isCustom: false, goal: 1 },
        ...customHabits.map((h) => ({
            id: h.id,
            label: h.name,
            isCustom: true,
            goal: h.target_value,
        })),
    ], [customHabits, creatineGoal]);

    const singleHabitData = useMemo(() => {
        const opt = habitOptions.find((o) => o.id === selectedHabitId);
        if (!opt) return { points: [], goal: 1 };
        return computeSingleHabitTrendData(
            opt.id, opt.isCustom, habitEntries, customHabitEntries, opt.goal
        );
    }, [selectedHabitId, habitOptions, habitEntries, customHabitEntries]);

    const habitChartData = useMemo(() =>
        singleHabitData.points.map((p) => ({
            date: format(new Date(p.date + "T00:00:00"), "MM/dd"),
            value: p.value,
        })),
        [singleHabitData]
    );

    async function handleExport() {
        setExporting(true);
        const endDate = new Date().toISOString();
        const startDate = subDays(new Date(), 30).toISOString();

        const csv = await exportEntriesCsv(startDate, endDate);
        if (!csv) {
            toast.error("No entries to export");
            setExporting(false);
            return;
        }

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lifeboard-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export downloaded!");
        setExporting(false);
    }

    async function handlePayOff() {
        if (!debtState || debtState.totalDebtCents === 0) return;
        const amount = formatCents(debtState.totalDebtCents);
        if (!window.confirm(`This will clear ${amount} in total debt. Are you sure?`)) return;
        setPayingOff(true);
        const result = await payOffTotalDebt();
        if (result.error) toast.error(result.error);
        else toast.success("Total debt cleared");
        setPayingOff(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Analytics & Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Insights from your nutrition data
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={exporting}
                >
                    <Download className="h-4 w-4 mr-2" />
                    {exporting ? "Exporting..." : "Export CSV"}
                </Button>
            </div>

            {/* TDEE Insight Card */}
            {tdee && <div className="mb-6"><TDEECard tdee={tdee} /></div>}

            {/* Weekly Summary Cards */}
            {weeklySummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Avg Calories</p>
                            <p className="text-2xl font-bold">{weeklySummary.avgCalories}</p>
                            <p className="text-xs text-muted-foreground">per day (7d)</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Avg Protein</p>
                            <p className="text-2xl font-bold">{weeklySummary.avgProtein}g</p>
                            <p className="text-xs text-muted-foreground">per day (7d)</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Days Logged</p>
                            <p className="text-2xl font-bold">
                                {weeklySummary.daysLogged}/7
                            </p>
                            <p className="text-xs text-muted-foreground">this week</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">Total Entries</p>
                            <p className="text-2xl font-bold">
                                {weeklySummary.totalEntries}
                            </p>
                            <p className="text-xs text-muted-foreground">this week</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Charts */}
            <Tabs defaultValue="calories" className="space-y-4">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="calories" className="gap-2">
                        <TrendingUp className="h-4 w-4" />
                        <span className="hidden sm:inline">Calories</span>
                    </TabsTrigger>
                    <TabsTrigger value="macros" className="gap-2">
                        <BarChart3 className="h-4 w-4" />
                        <span className="hidden sm:inline">Macros</span>
                    </TabsTrigger>
                    <TabsTrigger value="breakdown" className="gap-2">
                        <PieChart className="h-4 w-4" />
                        <span className="hidden sm:inline">Meals</span>
                    </TabsTrigger>
                    <TabsTrigger value="weight" className="gap-2">
                        <Scale className="h-4 w-4" />
                        <span className="hidden sm:inline">Weight</span>
                    </TabsTrigger>
                    <TabsTrigger value="habits" className="gap-2">
                        <Pill className="h-4 w-4" />
                        <span className="hidden sm:inline">Habits</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="calories">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Calorie Trend (30 Days)
                            </CardTitle>
                            <CardDescription>
                                Daily calorie intake over the last month
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            className="stroke-muted"
                                        />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 12 }}
                                            className="fill-muted-foreground"
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis
                                            tick={{ fontSize: 12 }}
                                            className="fill-muted-foreground"
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--card))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: "8px",
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="calories"
                                            stroke="#f97316"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                    No data available yet
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="macros">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Macro Trends (30 Days)
                            </CardTitle>
                            <CardDescription>
                                Protein, carbs, and fat over time
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            className="stroke-muted"
                                        />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 12 }}
                                            className="fill-muted-foreground"
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis
                                            tick={{ fontSize: 12 }}
                                            className="fill-muted-foreground"
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--card))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: "8px",
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="protein"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Protein (g)"
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="carbs"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Carbs (g)"
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="fat"
                                            stroke="#a855f7"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Fat (g)"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                    No data available yet
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="breakdown">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Today&apos;s Meal Breakdown
                            </CardTitle>
                            <CardDescription>
                                Calorie distribution by meal type
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {pieData.length > 0 ? (
                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <ResponsiveContainer width="100%" height={250}>
                                        <RechartsPieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={2}
                                                dataKey="value"
                                            >
                                                {pieData.map((_, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                                                    />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: "hsl(var(--card))",
                                                    border: "1px solid hsl(var(--border))",
                                                    borderRadius: "8px",
                                                }}
                                                formatter={(value: number | undefined) => [`${value ?? 0} cal`, ""]}
                                            />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                    <div className="space-y-2">
                                        {pieData.map((item, index) => (
                                            <div key={item.name} className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            PIE_COLORS[index % PIE_COLORS.length],
                                                    }}
                                                />
                                                <span className="text-sm">
                                                    {item.name}: {item.value} cal ({item.percentage}%)
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                                    No meals logged today
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Weight Tab */}
                <TabsContent value="weight">
                    {/* Weight Stats Cards */}
                    {weightStats && weightStats.current !== null && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Current</p>
                                    <p className="text-2xl font-bold">{weightStats.current} kg</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Week Change</p>
                                    <p className={`text-2xl font-bold ${weightStats.weekChange !== null && weightStats.weekChange < 0 ? 'text-green-500' : weightStats.weekChange !== null && weightStats.weekChange > 0 ? 'text-red-500' : ''}`}>
                                        {weightStats.weekChange !== null ? `${weightStats.weekChange > 0 ? '+' : ''}${weightStats.weekChange.toFixed(1)} kg` : '—'}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Month Change</p>
                                    <p className={`text-2xl font-bold ${weightStats.monthChange !== null && weightStats.monthChange < 0 ? 'text-green-500' : weightStats.monthChange !== null && weightStats.monthChange > 0 ? 'text-red-500' : ''}`}>
                                        {weightStats.monthChange !== null ? `${weightStats.monthChange > 0 ? '+' : ''}${weightStats.monthChange.toFixed(1)} kg` : '—'}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Range</p>
                                    <p className="text-2xl font-bold">{weightStats.lowest}–{weightStats.highest}</p>
                                    <p className="text-xs text-muted-foreground">kg (90d)</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Weight Trend Chart */}
                    <Card className="mb-4">
                        <CardHeader>
                            <CardTitle className="text-base">Weight Trend</CardTitle>
                            <CardDescription>Daily weight over the last 90 days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {weightChartData.length > 0 ? (
                                <div style={{ minWidth: 0, width: '100%' }}>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={weightChartData}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis dataKey="date" tick={{ fontSize: 12 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                                            <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(value: number | undefined) => [`${value ?? 0} kg`, 'Weight']} />
                                            <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                                    No weight entries yet. Log your weight from the dashboard.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Weight vs Calories Correlation */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Weight vs Calories</CardTitle>
                            <CardDescription>Correlation between daily calorie intake and weight over 30 days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {weightCalorieChartData.length > 0 ? (
                                <div style={{ minWidth: 0, width: '100%' }}>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <ComposedChart data={weightCalorieChartData}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                            <XAxis dataKey="date" tick={{ fontSize: 12 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                                            <YAxis yAxisId="weight" orientation="left" domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 12 }} className="fill-muted-foreground" label={{ value: 'kg', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                                            <YAxis yAxisId="calories" orientation="right" tick={{ fontSize: 12 }} className="fill-muted-foreground" label={{ value: 'cal', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />
                                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                                            <Bar yAxisId="calories" dataKey="calories" fill="hsl(var(--muted-foreground))" opacity={0.2} name="Calories" />
                                            <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Weight (kg)" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                                    Need both weight and food entries to show correlation
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Habits Tab */}
                <TabsContent value="habits">
                    {/* Weekly Summary Cards */}
                    {habitWeeklyStats && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Creatine</p>
                                    <p className="text-2xl font-bold">{habitWeeklyStats.creatineCompletionPct}%</p>
                                    <p className="text-xs text-muted-foreground">completed (7d)</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Magnesium</p>
                                    <p className="text-2xl font-bold">{habitWeeklyStats.magnesiumCompletionPct}%</p>
                                    <p className="text-xs text-muted-foreground">completed (7d)</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">Gym</p>
                                    <p className="text-2xl font-bold">{habitWeeklyStats.gymDays}/{habitWeeklyStats.gymGoal}</p>
                                    <p className="text-xs text-muted-foreground">days (7d)</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* 30-day Single Habit Chart */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base">Habit Trend (30 Days)</CardTitle>
                                    <CardDescription>
                                        Daily completion over the last month
                                    </CardDescription>
                                </div>
                                <Select value={selectedHabitId} onValueChange={setSelectedHabitId}>
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Select habit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {habitOptions.map((opt) => (
                                            <SelectItem key={opt.id} value={opt.id}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={habitChartData}>
                                    <defs>
                                        <linearGradient id="habitGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 12 }}
                                        className="fill-muted-foreground"
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                        }}
                                    />
                                    <ReferenceLine
                                        y={singleHabitData.goal}
                                        stroke="var(--muted-foreground)"
                                        strokeDasharray="3 3"
                                        label={{ value: "Goal", position: "insideTopRight", fontSize: 11 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                        fill="url(#habitGradient)"
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Habit Debt */}
            {debtState && (debtState.debts.length > 0 || debtState.totalDebtCents > 0) && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="text-base">Habit Debt</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Summary row */}
                        <div className="space-y-2">
                            {today && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        This week ({format(new Date(getMondayOfWeek(today) + "T12:00:00"), "MMM d")}–
                                        {format(new Date(getMondayOfWeek(today) + "T12:00:00").setDate(
                                            new Date(getMondayOfWeek(today) + "T12:00:00").getDate() + 6
                                        ), "MMM d")})
                                    </span>
                                    <span className="font-medium">
                                        {formatCents(debtState.currentWeekTotalCents)}
                                        {" "}
                                        <span className="text-muted-foreground font-normal">
                                            ({debtState.debts.reduce((s, d) => s + d.debt_count, 0)} misses)
                                        </span>
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Total owed</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-red-600 dark:text-red-400">
                                        {formatCents(debtState.totalDebtCents)}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        disabled={debtState.totalDebtCents === 0 || payingOff}
                                        onClick={handlePayOff}
                                    >
                                        {payingOff ? "Clearing..." : "Mark as Paid"}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Per-habit rows */}
                        {debtState.debts.filter((d) => d.debt_count > 0).length > 0 && (
                            <div className="space-y-1">
                                {debtState.debts
                                    .filter((d) => d.debt_count > 0)
                                    .sort((a, b) => b.debt_count - a.debt_count)
                                    .map((d) => (
                                        <div key={d.id} className="flex items-center justify-between text-sm text-muted-foreground">
                                            <span>{getHabitDisplayName(d.habit_type, d.custom_habit_id, customHabits)}</span>
                                            <span>
                                                {d.debt_count} miss{d.debt_count !== 1 ? "es" : ""} this week
                                                {" · "}
                                                {formatCents(d.current_week_unpaid_cents)}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
