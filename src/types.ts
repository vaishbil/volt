export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string;
  effort: "Low" | "Medium" | "High";
  category: "Work" | "Study" | "Personal" | "Other";
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  // AI Prioritization fields
  priorityRank?: number;
  priorityReason?: string;
  isAtRisk?: boolean;
  color?: string;
}

export interface Habit {
  id: string;
  name: string;
  frequency: "Daily" | "Weekly";
  targetDuration?: string; // e.g. "30 mins", optional
  goalDuration?: number; // e.g. 30 days, optional
  createdAt: string;
  history: string[]; // dates when completed, e.g., ["2026-06-25", "2026-06-24"]
}

