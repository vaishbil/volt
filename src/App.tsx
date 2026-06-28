/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Trash2, Sparkles, MessageSquare, X, Send, Calendar, Check, Flame, Plus, ChevronDown, ChevronUp, Clock, LogOut, RefreshCw, GripVertical, ListTodo, Target, BarChart2, Zap, Menu, ArrowRight, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, ListMusic } from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";
import { Task, Habit } from "./types";
import { initAuth, googleSignIn, logout } from "./lib/firebase";
import { startAmbient, stopAmbient, setAmbientVolume } from "./lib/audioSynth";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import confetti from "canvas-confetti";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const AMBIENT_TRACKS = [
  { id: "rain", name: "Rain Shower", desc: "Soothing rain patter", icon: "🌧️" },
  { id: "campfire", name: "Cozy Campfire", desc: "Warm crackling fireplace", icon: "🔥" },
  { id: "stream", name: "Forest Stream", desc: "Gentle bubbling water", icon: "💧" },
  { id: "drone", name: "Cosmic Drone", desc: "Deep space focus pad", icon: "🌌" },
  { id: "calm1", name: "Calm Focus 1", desc: "Lofi calm song 1", icon: "🎧", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: "calm2", name: "Calm Focus 2", desc: "Lofi calm song 2", icon: "🎧", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: "deepwork", name: "Deep Work", desc: "Lofi calm song 3", icon: "🎧", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: "flowstate", name: "Flow State", desc: "Lofi calm song 4", icon: "🎧", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" }
];

const FOCUS_BACKGROUNDS = [
  { id: "lake", name: "Peaceful Lake", url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2560&auto=format&fit=crop", effect: "fireflies" },
  { id: "forest", name: "Sunlit Forest", url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2560&auto=format&fit=crop", effect: "fireflies" },
  { id: "mountains", name: "Foggy Peaks", url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2560&auto=format&fit=crop", effect: "fog" },
  { id: "autumn", name: "Autumn Stream", url: "https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=2560&auto=format&fit=crop", effect: "leaves" },
  { id: "meadow", name: "Lush Meadow", url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=2560&auto=format&fit=crop", effect: "fireflies" },
  { id: "valley", name: "Green Valley", url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2560&auto=format&fit=crop", effect: "fog" },
  { id: "cabin-rain", name: "Rainy Cabin", url: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=2560&auto=format&fit=crop", effect: "rain" },
  { id: "forest-rain", name: "Woodland Rain", url: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?q=80&w=2560&auto=format&fit=crop", effect: "rain" },
  { id: "city-rain", name: "City Raindrops", url: "https://images.unsplash.com/photo-1428908728789-d2de25dbd4e2?q=80&w=2560&auto=format&fit=crop", effect: "rain" }
];

const generateContentWithFallback = async (aiClient: any, params: any) => {
  const modelToTry = params.model || "gemini-3.5-flash";
  try {
    return await aiClient.models.generateContent({
      ...params,
      model: modelToTry,
    });
  } catch (err: any) {
    console.warn(`Failed with model ${modelToTry}. Trying fallback...`, err);
    // Fallback models in order of capability / availability
    const fallbacks = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    for (const fb of fallbacks) {
      if (fb === modelToTry) continue;
      try {
        console.log(`Attempting fallback model: ${fb}`);
        return await aiClient.models.generateContent({
          ...params,
          model: fb,
        });
      } catch (innerErr) {
        console.warn(`Fallback model ${fb} also failed:`, innerErr);
      }
    }
    // If all else fails, rethrow the original error
    throw err;
  }
};

const convert24To12Hour = (timeStr: string): string => {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm|Am|Pm))?$/);
  if (!match) return timeStr;
  
  const [_, hoursStr, minutesStr, ampm] = match;
  if (ampm) {
    return `${parseInt(hoursStr, 10)}:${minutesStr} ${ampm.toUpperCase()}`;
  }
  
  let hours = parseInt(hoursStr, 10);
  const minutes = minutesStr;
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  
  return `${hours}:${minutes} ${suffix}`;
};

const parseTimeToTodayDate = (timeStr: string): Date | null => {
  try {
    const cleanTime = timeStr.trim().toUpperCase()
      .replace(/[\[\]\*_~`]/g, "") // strip markdown bold/italic/brackets
      .trim();

    // Check with colon: "08:00 AM", "8:00AM", "12:00"
    const colonMatch = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    
    let hours = 0;
    let minutes = 0;
    let isPM = false;
    let hasAMPM = false;

    if (colonMatch) {
      const [_, hoursStr, minutesStr, ampm] = colonMatch;
      hours = parseInt(hoursStr, 10);
      minutes = parseInt(minutesStr, 10);
      if (ampm) {
        hasAMPM = true;
        isPM = ampm === "PM";
      }
    } else {
      // Check without colon: "9 AM", "9AM", "9PM"
      const noColonMatch = cleanTime.match(/^(\d{1,2})\s*(AM|PM)$/);
      if (noColonMatch) {
        const [_, hoursStr, ampm] = noColonMatch;
        hours = parseInt(hoursStr, 10);
        minutes = 0;
        hasAMPM = true;
        isPM = ampm === "PM";
      } else {
        const parts = cleanTime.split(":");
        if (parts.length >= 2) {
          hours = parseInt(parts[0], 10);
          minutes = parseInt(parts[1], 10);
        } else {
          // Just a raw hour number: "9", "13"
          const rawInt = parseInt(cleanTime, 10);
          if (!isNaN(rawInt) && rawInt >= 0 && rawInt <= 24) {
            hours = rawInt;
            minutes = 0;
          } else {
            return null;
          }
        }
      }
    }
    
    if (isNaN(hours) || isNaN(minutes)) return null;

    if (hasAMPM) {
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }
    
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, 0);
  } catch {
    return null;
  }
};

const formatTimeRangeTo12Hour = (timeRangeStr: string): string => {
  if (!timeRangeStr) return "";
  const normalizedRange = timeRangeStr
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+to\s+/gi, "-");
  const cleanRange = normalizedRange.replace(/[\[\]\*_~`]/g, "").trim();
  const parts = cleanRange.split("-").map(p => p.trim());
  if (parts.length === 2) {
    const start = convert24To12Hour(parts[0]);
    const end = convert24To12Hour(parts[1]);
    return `${start} - ${end}`;
  }
  return cleanRange;
};

const getCurrentWeekDays = (currentTime: Date) => {
  const days = [];
  const currentDayOfWeek = currentTime.getDay(); // 0 is Sunday, 1 is Monday...
  
  const diffToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  
  const monday = new Date(currentTime);
  monday.setDate(currentTime.getDate() + diffToMonday);
  
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    days.push({
      dayName: dayNames[i],
      dayNumber: d.getDate(),
      dateStr,
      isToday: dateStr === currentTime.toISOString().split("T")[0]
    });
  }
  return days;
};

const getHabitGoalDays = (habit: Habit, todayStr: string) => {
  const goal = habit.goalDuration || 30;
  const createdDateStr = habit.createdAt.split("T")[0];
  const parts = createdDateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const days = [];
  for (let i = 1; i <= goal; i++) {
    const d = new Date(year, month, day + (i - 1));
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    const isCompleted = habit.history.includes(dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const isPast = dateStr < todayStr;
    
    days.push({
      dayNumber: i,
      dateStr,
      isCompleted,
      isToday,
      isPast,
      isFuture
    });
  }
  return days;
};

interface PlanItem {
  id: string;
  type: "task" | "break_meal" | "warning" | "other";
  timeRange?: string;
  activity?: string;
  note?: string;
  rawText: string;
}

const parsePlan = (text: string): PlanItem[] => {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return lines.map((rawLine, index) => {
    const id = `plan-item-${index}`;
    // Clean leading list bullets, stars, hyphens or numbers like "1. "
    const line = rawLine
      .replace(/^[\s*\-•▪◦\+]+/g, "")
      .replace(/^\d+\.\s+/g, "")
      .trim();
    const lowerLine = line.toLowerCase();
    
    // Normalize and clean line
    const cleanLine = line.replace(/[\*#_~`\[\]]/g, "").trim();

    // Check if it fits a time range prefix like "8:00 AM - 9:00 AM" or "08:00 - 09:00"
    const timeRangeRegex = /^(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*[\-–—to\s]+\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i;
    
    let timeRange = "";
    let activity = "";
    let note = "";
    let isPlanLine = false;

    if (cleanLine.includes("|")) {
      const parts = cleanLine.split("|").map(p => p.trim());
      timeRange = formatTimeRangeTo12Hour(parts[0]);
      activity = parts[1] || "";
      note = parts[2] || "";
      isPlanLine = true;
    } else {
      const match = cleanLine.match(timeRangeRegex);
      if (match) {
        timeRange = formatTimeRangeTo12Hour(match[1]);
        const rest = cleanLine.slice(match[0].length).trim();
        // Remove leading colon, dash, pipe, or space
        const cleanRest = rest.replace(/^[:\-–—\|\s]+/g, "").trim();
        if (cleanRest.includes("|")) {
          const parts = cleanRest.split("|").map(p => p.trim());
          activity = parts[0];
          note = parts[1] || "";
        } else if (cleanRest.includes("-")) {
          const parts = cleanRest.split("-").map(p => p.trim());
          activity = parts[0];
          note = parts.slice(1).join(" - ");
        } else if (cleanRest.includes(":")) {
          const parts = cleanRest.split(":").map(p => p.trim());
          activity = parts[0];
          note = parts.slice(1).join(": ");
        } else {
          activity = cleanRest;
        }
        isPlanLine = true;
      }
    }

    // Check if it's a warning
    if (
      lowerLine.startsWith("warning") || 
      lowerLine.includes("warning:") ||
      lowerLine.includes("cannot fit") || 
      lowerLine.includes("could not fit") || 
      lowerLine.includes("unable to fit") || 
      lowerLine.includes("risk") || 
      lowerLine.includes("at risk")
    ) {
      return {
        id,
        type: "warning",
        timeRange: timeRange || undefined,
        activity: activity || undefined,
        note: note || undefined,
        rawText: rawLine
      };
    }

    if (isPlanLine && timeRange && activity) {
      const lowerActivity = activity.toLowerCase();
      const isBreakOrMeal = 
        lowerActivity.includes("break") || 
        lowerActivity.includes("meal") || 
        lowerActivity.includes("lunch") || 
        lowerActivity.includes("dinner") || 
        lowerActivity.includes("breakfast") || 
        lowerActivity.includes("snack") || 
        lowerActivity.includes("rest") || 
        lowerActivity.includes("coffee") || 
        lowerActivity.includes("tea") || 
        lowerActivity.includes("relax");

      return {
        id,
        type: isBreakOrMeal ? "break_meal" : "task",
        timeRange,
        activity,
        note: note || undefined,
        rawText: rawLine
      };
    }

    return {
      id,
      type: "other",
      rawText: rawLine
    };
  });
};

function SortableHabitWrapper({ id, children }: { id: string, children: (dragHandleProps: any) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

const parseHabitDuration = (durationStr: string | undefined): number | null => {
  if (!durationStr) return null;
  const normalized = durationStr.toLowerCase().trim();
  
  const match = normalized.match(/^([\d.]+)\s*([a-z]*)/);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  if (isNaN(value)) return null;
  
  if (unit.startsWith("hour") || unit.startsWith("hr")) {
    return Math.round(value * 60);
  }
  if (unit.startsWith("min")) {
    return Math.round(value);
  }
  
  return Math.round(value);
};

export default function App() {
  const [time, setTime] = useState(new Date());

  // Onboarding & user states
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem("clutch_user_name") || "";
  });
  const [userWakeTime, setUserWakeTime] = useState<string>(() => {
    return localStorage.getItem("clutch_wake_time") || "08:00 AM";
  });
  const [userSleepTime, setUserSleepTime] = useState<string>(() => {
    return localStorage.getItem("clutch_sleep_time") || "10:00 PM";
  });
  const [userWorkStyle, setUserWorkStyle] = useState<string>(() => {
    return localStorage.getItem("clutch_work_style") || "Balanced";
  });

  const [onboardingStep, setOnboardingStep] = useState(1);
  const [tempName, setTempName] = useState("");
  const [tempWakeTime, setTempWakeTime] = useState("08:00 AM");
  const [tempSleepTime, setTempSleepTime] = useState("10:00 PM");
  const [tempWorkStyle, setTempWorkStyle] = useState("Balanced");
  const [isTransitioningStep, setIsTransitioningStep] = useState(false);
  
  // Google Calendar Integration states
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isExportingCalendar, setIsExportingCalendar] = useState(false);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        if (token) {
          handleSyncTodayEvents(token);
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleConnectCalendar = async () => {
    setCalendarError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        await handleSyncTodayEvents(result.accessToken);
      }
    } catch (err: any) {
      console.error("Google sign in failed:", err);
      setCalendarError("Connection failed: " + (err.message || err));
    }
  };

  const handleDisconnectCalendar = async () => {
    if (window.confirm("Disconnect your Google Calendar?")) {
      await logout();
      setUser(null);
      setAccessToken(null);
      setCalendarEvents([]);
    }
  };

  const handleSyncTodayEvents = async (token = accessToken) => {
    const activeToken = token || accessToken;
    if (!activeToken) {
      setCalendarError("Calendar is not connected.");
      return;
    }

    setIsSyncingCalendar(true);
    setCalendarError(null);

    try {
      const d = new Date();
      const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const endD = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const params = new URLSearchParams({
        timeMin: startD.toISOString(),
        timeMax: endD.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
      });

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 401) {
          setUser(null);
          setAccessToken(null);
          throw new Error("Session expired. Please reconnect Google Calendar.");
        }
        throw new Error("Failed to retrieve calendar events.");
      }

      const data = await res.json();
      const events = data.items || [];
      setCalendarEvents(events);

      if (events.length > 0) {
        const formatted = events
          .filter((e: any) => e.summary)
          .map((e: any) => {
            const summary = e.summary;
            let timePart = "";
            if (e.start?.dateTime) {
              const startEvent = new Date(e.start.dateTime);
              let hours = startEvent.getHours();
              const minutes = String(startEvent.getMinutes()).padStart(2, "0");
              const ampm = hours >= 12 ? "PM" : "AM";
              hours = hours % 12;
              if (hours === 0) hours = 12;
              timePart = ` at ${hours}:${minutes} ${ampm}`;
            } else if (e.start?.date) {
              timePart = " (all day)";
            }
            return `${summary}${timePart}`;
          })
          .join(", ");

        setFixedEvents(formatted);
      } else {
        setCalendarError("No events scheduled for today.");
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      setCalendarError(err.message || "Failed to fetch events.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleExportPlanToCalendar = async () => {
    console.log("=== Google Calendar Export Start ===");
    setExportSuccess(null);
    setExportError(null);

    let activeToken = accessToken;
    if (!activeToken) {
      try {
        activeToken = localStorage.getItem("clutch_google_cal_token");
        console.log("AccessToken from state is null, read from localStorage instead:", activeToken ? "Found" : "Not Found");
      } catch (e) {
        console.error("Failed to read token from localStorage:", e);
      }
    }

    if (!activeToken) {
      console.warn("No access token found. Cannot export plan.");
      setExportError("Please connect your Google Calendar first.");
      return;
    }

    console.log("Raw planner output text to parse:", plannerOutput);
    const planItems = parsePlan(plannerOutput || "");
    console.log("Parsed plan items:", planItems);

    const exportableItems = planItems.filter(
      item => (item.type === "task" || item.type === "break_meal") && item.timeRange && item.activity
    );
    console.log("Filtered exportable items:", exportableItems);

    if (exportableItems.length === 0) {
      console.warn("No exportable schedules found in the plan. Parsed items list was empty or lacked required fields.");
      setExportError("No exportable schedules (with valid time ranges and activities) found in the current plan.");
      return;
    }

    setIsExportingCalendar(true);
    let successCount = 0;
    let failCount = 0;
    const errorsList: string[] = [];

    for (const item of exportableItems) {
      try {
        console.log(`Processing item: "${item.activity}" with raw time range: "${item.timeRange}"`);
        const normalizedRange = item.timeRange!
          .replace(/[\u2013\u2014]/g, "-")
          .replace(/\s+to\s+/gi, "-");
        
        const timeParts = normalizedRange.split("-").map(p => p.trim());
        if (timeParts.length !== 2) {
          console.warn(`Skipping item due to invalid timeRange parts length (${timeParts.length}):`, item);
          continue;
        }

        let startStr = timeParts[0];
        let endStr = timeParts[1];
        
        // Smart AM/PM alignment: if the end has AM/PM but the start doesn't, copy it
        const hasAmPm = (s: string) => /AM|PM/i.test(s);
        if (!hasAmPm(startStr) && hasAmPm(endStr)) {
          const ampmMatch = endStr.match(/(AM|PM)/i);
          if (ampmMatch) {
            startStr = `${startStr} ${ampmMatch[1]}`;
            console.log(`Smart matched AM/PM context to start: "${timeParts[0]}" -> "${startStr}"`);
          }
        }

        const startTime = parseTimeToTodayDate(startStr);
        const endTime = parseTimeToTodayDate(endStr);

        if (!startTime || !endTime) {
          console.warn(`Could not parse start or end time for item. Start: "${startStr}" -> ${startTime}, End: "${endStr}" -> ${endTime}`);
          continue;
        }

        // Correct for crossing midnight (e.g. 11 PM to 12:30 AM)
        if (endTime.getTime() < startTime.getTime()) {
          endTime.setDate(endTime.getDate() + 1);
          console.log(`Midnight crossover corrected. Adjusted end time: ${endTime.toISOString()}`);
        }

        const eventBody = {
          summary: item.activity,
          description: item.note ? `${item.note} (Synced from Volt)` : "Planned via Volt Day Planner",
          start: {
            dateTime: startTime.toISOString(),
          },
          end: {
            dateTime: endTime.toISOString(),
          },
        };

        console.log(`Sending API request to Google Calendar for event: "${item.activity}"`, eventBody);

        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${activeToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventBody),
          }
        );

        if (res.ok) {
          successCount++;
          console.log(`Event successfully created in Google Calendar: "${item.activity}"`);
        } else {
          failCount++;
          const errText = await res.text();
          console.error(`Google API failure creating event "${item.activity}". Status: ${res.status}. Body: ${errText}`);
          errorsList.push(`"${item.activity}" (${res.status})`);
        }
      } catch (err: any) {
        console.error(`Exception while processing event "${item.activity}":`, err);
        failCount++;
        errorsList.push(`"${item.activity}" (Error: ${err.message || err})`);
      }
    }

    setIsExportingCalendar(false);
    console.log(`=== Export Finished. Success: ${successCount}, Failed: ${failCount} ===`);

    if (successCount > 0) {
      setExportSuccess(`✓ ${successCount} events added to your Google Calendar`);
      if (failCount > 0) {
        setExportError(`Could not add ${failCount} events: ${errorsList.join(", ")}`);
      }
    } else {
      setExportError(`Failed to export events to Google Calendar. Errors: ${errorsList.join("; ") || "Unknown parsing or network failure."}`);
    }
  };
  
  // State for all tasks
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem("clutch_tasks");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // AI analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [effort, setEffort] = useState<Task["effort"]>("Medium");
  const [category, setCategory] = useState<Task["category"]>("Work");

  const [taskCategoryFilter, setTaskCategoryFilter] = useState<"All" | Task["category"]>("All");


  // Tab navigation state
  const [activeTab, setActiveTab] = useState<"tasks" | "habits" | "day_planner" | "focus_room" | "stats">("tasks");
  const [showShareModal, setShowShareModal] = useState(false);

  // Focus Room States
  const [ambientTrack, setAmbientTrack] = useState<string>("rain");
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
  const [ambientVolume, setAmbientVolumeState] = useState(0.5);
  const [ambientTime, setAmbientTime] = useState(0);
  const [showTrackSelector, setShowTrackSelector] = useState(false);

  // Lock In States
  const [completedFocusSessions, setCompletedFocusSessions] = useState(() => {
    return parseInt(localStorage.getItem("clutch_focus_sessions") || "0", 10);
  });
  const [lockInType, setLockInType] = useState<"task" | "habit">("task");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [selectedHabitId, setSelectedHabitId] = useState<string>("");
  const [customFocusTarget, setCustomFocusTarget] = useState<string>("");
  const [focusPreset, setFocusPreset] = useState<25 | 45 | 60 | "custom">(25);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [isLockingIn, setIsLockingIn] = useState(false);
  const [lockInMode, setLockInMode] = useState<"focus" | "break">("focus");
  const [lockInSecondsLeft, setLockInSecondsLeft] = useState(0);
  const [lockInTotalDuration, setLockInTotalDuration] = useState(0);
  const [lockInIsPaused, setLockInIsPaused] = useState(false);
  const [lockInCompleted, setLockInCompleted] = useState(false);
  const [sessionCompletedMinutes, setSessionCompletedMinutes] = useState(0);
  const [savedFocusSecondsLeft, setSavedFocusSecondsLeft] = useState<number | null>(null);
  const [savedFocusTotalDuration, setSavedFocusTotalDuration] = useState<number | null>(null);
  const [focusBgIndex, setFocusBgIndex] = useState(0);

  // Synchronize audio synthesis state with react states
  useEffect(() => {
    if (isAmbientPlaying) {
      const track = AMBIENT_TRACKS.find(t => t.id === ambientTrack);
      startAmbient(ambientTrack, track?.url);
    } else {
      stopAmbient();
    }
  }, [isAmbientPlaying, ambientTrack]);

  useEffect(() => {
    setAmbientVolume(ambientVolume);
  }, [ambientVolume]);

  // Keep track of active ambient track playing time (counter)
  useEffect(() => {
    let interval: any = null;
    if (isAmbientPlaying) {
      interval = setInterval(() => {
        setAmbientTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isAmbientPlaying]);

  // Habits & Goals states
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const saved = localStorage.getItem("clutch_habits");
      return saved ? JSON.parse(saved) : [
        {
          id: "h1",
          name: "Morning Meditation",
          frequency: "Daily",
          targetDuration: "15 mins",
          goalDuration: 30,
          createdAt: new Date().toISOString(),
          history: []
        },
        {
          id: "h2",
          name: "Read Book",
          frequency: "Daily",
          targetDuration: "30 mins",
          goalDuration: 30,
          createdAt: new Date().toISOString(),
          history: []
        },
        {
          id: "h3",
          name: "Weekly Fitness Session",
          frequency: "Weekly",
          targetDuration: "60 mins",
          goalDuration: 12,
          createdAt: new Date().toISOString(),
          history: []
        }
      ];
    } catch {
      return [];
    }
  });

  const selectedHabit = lockInType === "habit" ? habits.find(h => h.id === selectedHabitId) : null;
  const parsedHabitMinutes = (lockInType === "habit" && selectedHabitId && selectedHabitId !== "custom" && selectedHabit)
    ? parseHabitDuration(selectedHabit.targetDuration)
    : null;

  const activeFocusMinutes = parsedHabitMinutes !== null
    ? parsedHabitMinutes
    : (focusPreset === "custom" ? (parseInt(customMinutes, 10) || 25) : focusPreset);

  const activeBreakMinutes = parsedHabitMinutes !== null
    ? Math.round(parsedHabitMinutes * 0.2)
    : (focusPreset === 25 ? 5 : focusPreset === 45 ? 10 : focusPreset === 60 ? 15 : Math.round(activeFocusMinutes * 0.2));

  // Handle Lock In Timer countdown tick
  useEffect(() => {
    let interval: any = null;
    if (isLockingIn && !lockInIsPaused && lockInSecondsLeft > 0) {
      interval = setInterval(() => {
        setLockInSecondsLeft(prev => prev - 1);
      }, 1000);
    } else if (isLockingIn && !lockInIsPaused && lockInSecondsLeft === 0) {
      // Transition between Focus and Break!
      if (lockInMode === "focus") {
        setLockInMode("break");
        const breakSecs = activeBreakMinutes * 60;
        setLockInSecondsLeft(breakSecs);
        setLockInTotalDuration(breakSecs);
        // Play beep
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(600, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
          osc.start(0);
          osc.stop(audioCtx.currentTime + 0.8);
        } catch (e) {}

        // Confetti for completing a focus block
        try {
          if (typeof confetti === "function") {
            confetti({
              particleCount: 50,
              spread: 45,
              origin: { y: 0.6 }
            });
          }
        } catch (err) {}
      } else {
        // Break ends, auto-starts next focus session
        setLockInMode("focus");
        if (savedFocusSecondsLeft !== null) {
          setLockInSecondsLeft(savedFocusSecondsLeft);
          if (savedFocusTotalDuration !== null) {
            setLockInTotalDuration(savedFocusTotalDuration);
          }
          setSavedFocusSecondsLeft(null);
          setSavedFocusTotalDuration(null);
        } else {
          const focusSecs = activeFocusMinutes * 60;
          setLockInSecondsLeft(focusSecs);
          setLockInTotalDuration(focusSecs);
        }
        // Increment total focus sessions completed stat!
        setCompletedFocusSessions(prev => {
          const next = prev + 1;
          localStorage.setItem("clutch_focus_sessions", String(next));
          return next;
        });
        // Play beep
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(800, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
          osc.start(0);
          osc.stop(audioCtx.currentTime + 0.8);
        } catch (e) {}
      }
    }
    return () => clearInterval(interval);
  }, [isLockingIn, lockInIsPaused, lockInSecondsLeft, lockInMode, activeFocusMinutes, activeBreakMinutes, savedFocusSecondsLeft, savedFocusTotalDuration]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const [isAddHabitExpanded, setIsAddHabitExpanded] = useState(false);
  const [isAddTaskExpanded, setIsAddTaskExpanded] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitFrequency, setNewHabitFrequency] = useState<"Daily" | "Weekly">("Daily");
  const [newHabitDuration, setNewHabitDuration] = useState("");
  const [newHabitGoalDuration, setNewHabitGoalDuration] = useState<string>("30");
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);

  const [editingHabitName, setEditingHabitName] = useState("");
  const [editingHabitDuration, setEditingHabitDuration] = useState("");
  const [editingHabitGoalDuration, setEditingHabitGoalDuration] = useState<string>("30");
  const [editingHabitFrequency, setEditingHabitFrequency] = useState<"Daily" | "Weekly">("Daily");

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setHabits((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [geminiNudge, setGeminiNudge] = useState<string | null>(() => {
    try {
      return localStorage.getItem("clutch_habit_nudge");
    } catch {
      return null;
    }
  });
  const [isLoadingNudge, setIsLoadingNudge] = useState(false);
  const [recentlyCompletedHabitId, setRecentlyCompletedHabitId] = useState<string | null>(null);
  const [recentStreakIncreaseHabitId, setRecentStreakIncreaseHabitId] = useState<string | null>(null);
  const [celebrationHabit, setCelebrationHabit] = useState<string | null>(null);
  const prevStreaksRef = useRef<Record<string, number>>({});
  const isInitializedRef = useRef(false);

  const triggerConfettiCelebration = (habitName: string) => {
    setCelebrationHabit(habitName);
    
    // Standard explosion
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });

    // Side cannons for extra flair
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const calculateStreakForHabit = (history: string[], todayStr: string): number => {
    if (!history || history.length === 0) return 0;
    
    const uniqueDates = Array.from(new Set(history.filter(Boolean))).sort().reverse();
    if (uniqueDates.length === 0) return 0;

    const parseLocalDate = (dateStr: string) => {
      const parts = dateStr.split("-");
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    };

    const todayDate = parseLocalDate(todayStr);
    const todayTime = todayDate.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    const hasCompletedToday = uniqueDates.includes(todayStr);
    
    const yesterdayDate = new Date(todayTime - oneDayMs);
    const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;
    const hasCompletedYesterday = uniqueDates.includes(yesterdayStr);
    
    if (!hasCompletedToday && !hasCompletedYesterday) {
      return 0;
    }
    
    let streak = 0;
    let currentTargetDate = hasCompletedToday ? todayDate : yesterdayDate;
    
    while (true) {
      const targetStr = `${currentTargetDate.getFullYear()}-${String(currentTargetDate.getMonth() + 1).padStart(2, "0")}-${String(currentTargetDate.getDate()).padStart(2, "0")}`;
      if (uniqueDates.includes(targetStr)) {
        streak++;
        currentTargetDate = new Date(currentTargetDate.getTime() - oneDayMs);
      } else {
        break;
      }
    }
    
    return streak;
  };

  useEffect(() => {
    try {
      localStorage.setItem("clutch_habits", JSON.stringify(habits));
    } catch (err) {
      console.error("Error saving habits to localStorage:", err);
    }
  }, [habits]);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const newStreaks: Record<string, number> = {};
    
    habits.forEach(h => {
      newStreaks[h.id] = calculateStreakForHabit(h.history, todayStr);
    });

    if (isInitializedRef.current) {
      habits.forEach(h => {
        const oldStreak = prevStreaksRef.current[h.id] || 0;
        const newStreak = newStreaks[h.id] || 0;
        if (newStreak === 30 && oldStreak < 30) {
          triggerConfettiCelebration(h.name);
        }
      });
    } else {
      isInitializedRef.current = true;
    }

    prevStreaksRef.current = newStreaks;
  }, [habits]);

  useEffect(() => {
    const handleHabitsUpdated = () => {
      try {
        const saved = localStorage.getItem("clutch_habits");
        if (saved) {
          setHabits(JSON.parse(saved));
        }
      } catch (err) {
        console.error(err);
      }
    };
    window.addEventListener('habitsUpdated', handleHabitsUpdated);
    return () => window.removeEventListener('habitsUpdated', handleHabitsUpdated);
  }, []);

  useEffect(() => {
    const handleTasksUpdated = () => {
      try {
        const saved = localStorage.getItem("clutch_tasks");
        if (saved) {
          setTasks(JSON.parse(saved));
        }
      } catch (err) {
        console.error(err);
      }
    };
    window.addEventListener('tasksUpdated', handleTasksUpdated);
    return () => window.removeEventListener('tasksUpdated', handleTasksUpdated);
  }, []);

  useEffect(() => {
    if (activeTab !== "habits") return;
    
    const todayStr = new Date().toISOString().split("T")[0];
    const lastNudgeDate = localStorage.getItem("clutch_last_nudge_date");
    
    if (lastNudgeDate === todayStr && geminiNudge) {
      return;
    }
    
    const fetchNudge = async () => {
      setIsLoadingNudge(true);
      try {
        const habitsWithStreaks = habits.map(h => ({
          name: h.name,
          frequency: h.frequency,
          streak: calculateStreakForHabit(h.history, todayStr)
        }));
        
        const response = await fetch("/api/habits/nudge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ habits: habitsWithStreaks })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.nudge) {
            setGeminiNudge(data.nudge);
            localStorage.setItem("clutch_habit_nudge", data.nudge);
            localStorage.setItem("clutch_last_nudge_date", todayStr);
          }
        }
      } catch (err) {
        console.error("Error fetching habit nudge:", err);
      } finally {
        setIsLoadingNudge(false);
      }
    };
    
    fetchNudge();
  }, [activeTab, habits]);

  // Task inline editing states
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editEffort, setEditEffort] = useState<Task["effort"]>("Medium");
  const [editCategory, setEditCategory] = useState<Task["category"]>("Work");
  const [editColor, setEditColor] = useState<string>("");

  // Day Planner states
  const [dayStart, setDayStart] = useState(() => {
    try {
      return localStorage.getItem("clutch_planner_day_start") || "08:00";
    } catch {
      return "08:00";
    }
  });
  const [dayEnd, setDayEnd] = useState(() => {
    try {
      return localStorage.getItem("clutch_planner_day_end") || "18:00";
    } catch {
      return "18:00";
    }
  });
  const [fixedEvents, setFixedEvents] = useState(() => {
    try {
      return localStorage.getItem("clutch_planner_fixed_events") || "";
    } catch {
      return "";
    }
  });
  const [workStyle, setWorkStyle] = useState(() => {
    try {
      return localStorage.getItem("clutch_planner_work_style") || "Balanced (45 min work + breaks)";
    } catch {
      return "Balanced (45 min work + breaks)";
    }
  });

  // Planner output and running states
  const [plannerOutput, setPlannerOutput] = useState<string | null>(() => {
    try {
      return localStorage.getItem("clutch_day_plan") || null;
    } catch {
      return null;
    }
  });
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [showPlannerForm, setShowPlannerForm] = useState(false);
  const [isFetchingCalendarForForm, setIsFetchingCalendarForForm] = useState(false);
  const [isAutoFilledFromCalendar, setIsAutoFilledFromCalendar] = useState(false);
  const [includeHabitsInPlan, setIncludeHabitsInPlan] = useState(false);

  // Save planner settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("clutch_planner_day_start", dayStart);
    } catch {}
  }, [dayStart]);

  useEffect(() => {
    try {
      localStorage.setItem("clutch_planner_day_end", dayEnd);
    } catch {}
  }, [dayEnd]);

  useEffect(() => {
    try {
      localStorage.setItem("clutch_planner_fixed_events", fixedEvents);
    } catch {}
  }, [fixedEvents]);

  useEffect(() => {
    try {
      localStorage.setItem("clutch_planner_work_style", workStyle);
    } catch {}
  }, [workStyle]);

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("clutch_tasks", JSON.stringify(tasks));
  }, [tasks]);

  // Automated risk alerts states
  interface RiskAlert {
    taskTitle: string;
    reason: string;
    severity: "critical" | "warning";
  }
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [isCheckingRisk, setIsCheckingRisk] = useState(false);

  // Serialized representation of tasks to track added, deleted, or completed status
  const uncompletedTasksSerialized = JSON.stringify(
    tasks
      .filter((t) => !t.completed)
      .map((t) => ({
        id: t.id,
        title: t.title,
        deadline: t.deadline,
        effort: t.effort,
      }))
  );

  useEffect(() => {
    let isMounted = true;
    const checkRisks = async () => {
      const activeTasks = tasks.filter((t) => !t.completed);
      if (activeTasks.length === 0) {
        setRiskAlerts([]);
        return;
      }

      setIsCheckingRisk(true);
      try {
        const ai = new GoogleGenAI({
          apiKey: GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            }
          }
        });

        const taskPayload = activeTasks.map((t) => ({
          title: t.title,
          description: t.description,
          deadline: t.deadline,
          effort: t.effort,
          category: t.category,
        }));

        const promptText = `Analyze these tasks and identify which ones are at risk of being missed. A task is at risk if:
- Deadline is within 24 hours, OR
- Effort is High and deadline is within 48 hours, OR
- Effort is High or Medium and deadline has already passed
For each at-risk task return: taskTitle, reason (one short urgent sentence), severity (critical/warning)
Tasks: ${JSON.stringify(taskPayload)}
Current datetime: ${new Date().toISOString()}
Return only valid JSON array, no extra text.
If no tasks are at risk return empty array []`;

        const response = await generateContentWithFallback(ai, {
          model: "gemini-3.5-flash",
          contents: promptText,
          config: {
            responseMimeType: "application/json",
          },
        });

        const responseText = response.text?.trim() || "[]";
        if (!isMounted) return;

        const parsed = JSON.parse(responseText);
        if (Array.isArray(parsed)) {
          setRiskAlerts(parsed);
        } else if (parsed && typeof parsed === "object") {
          const foundArray = Object.values(parsed).find((val) => Array.isArray(val));
          if (foundArray) {
            setRiskAlerts(foundArray as RiskAlert[]);
          } else {
            setRiskAlerts([]);
          }
        } else {
          setRiskAlerts([]);
        }
      } catch (err) {
        console.error("Error checking at risk tasks automatically:", err);
      } finally {
        if (isMounted) {
          setIsCheckingRisk(false);
        }
      }
    };

    checkRisks();

    return () => {
      isMounted = false;
    };
  }, [uncompletedTasksSerialized]);

  // Floating Chat Widget states and functions
  interface ChatMessage {
    id: string;
    sender: "user" | "clutch";
    text: string;
    createdAt: string;
  }

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("clutch_sidebar_collapsed");
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const newValue = !prev;
      try {
        localStorage.setItem("clutch_sidebar_collapsed", JSON.stringify(newValue));
      } catch (err) {
        console.error("Failed to save sidebar state:", err);
      }
      return newValue;
    });
  };
  const [chatInput, setChatInput] = useState("");
  const [userMood, setUserMood] = useState<string | null>(null);
  const [showMoodSelector, setShowMoodSelector] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome-msg",
      sender: "clutch",
      text: "Hi, I'm Volt, your productivity companion! What can I help you tackle today?",
      createdAt: new Date().toISOString(),
    }
  ]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatThinking]);

  const formatLocalTime = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleFinishOnboarding = () => {
    localStorage.setItem("clutch_user_name", tempName);

    setUserName(tempName);
    setActiveTab("tasks");
  };

  const handleLoadDemoData = () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const in3Hours = new Date(Date.now() + 3 * 3600 * 1000);
    const in2Days = new Date(Date.now() + 2 * 24 * 3600 * 1000);

    const demoTasks: Task[] = [
      {
        id: "demo-t1",
        title: "Submit project proposal",
        description: "Finalize budget estimates and project timeline slides.",
        deadline: formatLocalTime(tomorrow),
        effort: "High",
        category: "Work",
        completed: false,
        createdAt: new Date().toISOString()
      },
      {
        id: "demo-t2",
        title: "Review meeting notes",
        description: "Catch up on items discussed in the weekly alignment meeting.",
        deadline: formatLocalTime(in3Hours),
        effort: "Low",
        category: "Work",
        completed: false,
        createdAt: new Date().toISOString()
      },
      {
        id: "demo-t3",
        title: "Complete React tutorial",
        description: "Finish the state management and lifecycle hooks sections.",
        deadline: formatLocalTime(in2Days),
        effort: "Medium",
        category: "Study",
        completed: false,
        createdAt: new Date().toISOString()
      }
    ];

    const demoHabits: Habit[] = [
      {
        id: "demo-h1",
        name: "Morning Meditation",
        frequency: "Daily",
        targetDuration: "15 mins",
        goalDuration: 30,
        createdAt: new Date().toISOString(),
        history: []
      },
      {
        id: "demo-h2",
        name: "Read Book",
        frequency: "Daily",
        targetDuration: "30 mins",
        goalDuration: 21,
        createdAt: new Date().toISOString(),
        history: []
      }
    ];

    localStorage.setItem("clutch_user_name", "Demo User");
    localStorage.setItem("clutch_tasks", JSON.stringify(demoTasks));
    localStorage.setItem("clutch_habits", JSON.stringify(demoHabits));
    localStorage.setItem("clutch_wake_time", "08:00 AM");
    localStorage.setItem("clutch_sleep_time", "10:00 PM");
    localStorage.setItem("clutch_work_style", "Balanced");

    setUserName("Demo User");
    setTasks(demoTasks);
    setHabits(demoHabits);
    setUserWakeTime("08:00 AM");
    setUserSleepTime("10:00 PM");
    setUserWorkStyle("Balanced");
    setActiveTab("tasks");
  };

  const sendChatMessage = async (userText: string) => {
    if (!userText.trim() || isChatThinking) return;
    setChatError(null);

    const newUserMessage: ChatMessage = {
      id: "msg-" + Date.now(),
      sender: "user",
      text: userText.trim(),
      createdAt: new Date().toISOString(),
    };

    // IMPROVEMENT 2: Check for action command intents
    const cleanedText = userText.trim();
    
    // Pattern 1: mark [task name] as done or complete [task name]
    const matchMarkDone = cleanedText.match(/^mark\s+(.+?)\s+as\s+done\.?$/i);
    const matchComplete = cleanedText.match(/^complete\s+(.+)$/i);
    
    if (matchMarkDone || matchComplete) {
      const taskName = (matchMarkDone ? matchMarkDone[1] : matchComplete![1]).trim();
      const lowercaseName = taskName.toLowerCase();
      let foundTask = tasks.find(t => t.title.toLowerCase() === lowercaseName);
      if (!foundTask) {
        foundTask = tasks.find(t => t.title.toLowerCase().includes(lowercaseName) || lowercaseName.includes(t.title.toLowerCase()));
      }
      
      if (foundTask) {
        setTasks((prev) =>
          prev.map((t) => (t.id === foundTask!.id ? { ...t, completed: true } : t))
        );
        const confirmMsg: ChatMessage = {
          id: "msg-confirm-" + Date.now(),
          sender: "clutch",
          text: `Done! Marked **${foundTask.title}** as complete ✓`,
          createdAt: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, newUserMessage, confirmMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: "msg-confirm-" + Date.now(),
          sender: "clutch",
          text: `I couldn't find a task named "${taskName}" to complete.`,
          createdAt: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, newUserMessage, errorMsg]);
      }
      return;
    }
    
    // Pattern 2: delete [task name] or remove [task name]
    const matchDelete = cleanedText.match(/^(?:delete|remove)\s+(.+)$/i);
    if (matchDelete) {
      const taskName = matchDelete[1].trim();
      const lowercaseName = taskName.toLowerCase();
      let foundTask = tasks.find(t => t.title.toLowerCase() === lowercaseName);
      if (!foundTask) {
        foundTask = tasks.find(t => t.title.toLowerCase().includes(lowercaseName) || lowercaseName.includes(t.title.toLowerCase()));
      }
      
      if (foundTask) {
        setTasks((prev) => prev.filter((t) => t.id !== foundTask!.id));
        const confirmMsg: ChatMessage = {
          id: "msg-confirm-" + Date.now(),
          sender: "clutch",
          text: `**${foundTask.title}** has been removed.`,
          createdAt: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, newUserMessage, confirmMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: "msg-confirm-" + Date.now(),
          sender: "clutch",
          text: `I couldn't find a task named "${taskName}" to remove.`,
          createdAt: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, newUserMessage, errorMsg]);
      }
      return;
    }
    
    // Pattern: "Add a habit", "Show my habits" chips
    if (cleanedText.toLowerCase() === "add a habit") {
      const confirmMsg: ChatMessage = {
        id: "msg-confirm-" + Date.now(),
        sender: "clutch",
        text: "Sure! Tell me the habit name, duration and how many days.\nExample: add habit morning yoga 20 mins 30 days",
        createdAt: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, newUserMessage, confirmMsg]);
      return;
    }

    if (cleanedText.toLowerCase() === "show my habits") {
      const todayStr = new Date().toISOString().split("T")[0];
      const habitsList = habits.map(h => `- **${h.name}**: ${calculateStreakForHabit(h.history, todayStr)} day streak 🔥`).join("\n");
      const confirmMsg: ChatMessage = {
        id: "msg-confirm-" + Date.now(),
        sender: "clutch",
        text: habits.length > 0 ? `Here are your current habits:\n${habitsList}` : "You don't have any habits yet. Try adding one!",
        createdAt: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, newUserMessage, confirmMsg]);
      return;
    }

    // Pattern: create habit [name] [duration] [days] [frequency]
    const matchHabit = cleanedText.match(/^(?:add|create|new)\s+(?:habit|goal)\s+(.+)$/i);
    if (matchHabit) {
      const habitDetailsStr = matchHabit[1];
      
      // Parse details
      let name = habitDetailsStr;
      let duration = "30 mins";
      let goalDays = 30;
      let frequency = "Daily";

      const durationMatch = name.match(/(\d+)\s*(?:mins|minutes|hour|hrs?)\b/i);
      if (durationMatch) {
        duration = durationMatch[0];
        name = name.replace(durationMatch[0], "").trim();
      }
      
      const daysMatch = name.match(/(?:for\s+)?(\d+)\s*(?:days?|day\s*challenge)\b/i);
      if (daysMatch) {
        goalDays = parseInt(daysMatch[1], 10);
        name = name.replace(daysMatch[0], "").trim();
      }
      
      const freqMatch = name.match(/\b(?:weekly|daily)\b/i);
      if (freqMatch) {
        frequency = freqMatch[0].toLowerCase() === "weekly" ? "Weekly" : "Daily";
        name = name.replace(freqMatch[0], "").trim();
      }
      
      // clean up any extra words or spaces left in name
      name = name.replace(/\s+/g, " ").trim();
      
      const newHabit: Habit = {
        id: Date.now().toString(),
        name: name || "New Habit",
        frequency: frequency as "Daily" | "Weekly",
        targetDuration: duration,
        goalDuration: goalDays,
        createdAt: new Date().toISOString(),
        history: []
      };

      const habitsRaw = localStorage.getItem("clutch_habits") || "[]";
      try {
        const existingHabits = JSON.parse(habitsRaw);
        existingHabits.push(newHabit);
        localStorage.setItem("clutch_habits", JSON.stringify(existingHabits));
        window.dispatchEvent(new Event('habitsUpdated'));
      } catch (e) {
        console.error("Failed to save habit to localStorage", e);
      }

      const confirmMsg: ChatMessage = {
        id: "msg-confirm-" + Date.now(),
        sender: "clutch",
        text: `Got it! Added habit '**${newHabit.name}**'\n✓ Duration: ${newHabit.targetDuration}\n✓ Goal: ${newHabit.goalDuration} days\n✓ Frequency: ${newHabit.frequency}\nYour streak starts today! 🔥\nSwitch to Habits & Goals tab to see it.`,
        createdAt: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, newUserMessage, confirmMsg]);
      return;
    }

    // Pattern 3: add task [task name] or add [anything]
    const matchAdd = cleanedText.match(/^add\s+(?:task\s+)?(.+)$/i);
    if (matchAdd) {
      const rawContent = matchAdd[1].trim();

      const parseDeadlineDate = (str: string): string => {
        const cleanStr = str.toLowerCase().trim();
        
        if (cleanStr === "today") {
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}T23:59`;
        }
        
        if (cleanStr === "tomorrow") {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}T23:59`;
        }
        
        const monthMap: { [key: string]: number } = {
          jan: 0, january: 0,
          feb: 1, february: 1,
          mar: 2, march: 2,
          apr: 3, april: 3,
          may: 4,
          jun: 5, june: 5,
          jul: 6, july: 6,
          aug: 7, august: 7,
          sep: 8, september: 8,
          oct: 9, october: 9,
          nov: 10, november: 10,
          dec: 11, december: 11
        };
        
        // Pattern 1: [day] [month] e.g., "29 june" or "29th june"
        const dayMonthMatch = cleanStr.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);
        if (dayMonthMatch) {
          const dayVal = parseInt(dayMonthMatch[1], 10);
          const monthName = dayMonthMatch[2];
          if (monthName in monthMap) {
            const d = new Date();
            d.setFullYear(2026);
            d.setMonth(monthMap[monthName]);
            d.setDate(dayVal);
            d.setHours(23, 59, 0, 0);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dayStr = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${dayStr}T23:59`;
          }
        }
        
        // Pattern 2: [month] [day] e.g., "june 29" or "june 29th"
        const monthDayMatch = cleanStr.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
        if (monthDayMatch) {
          const monthName = monthDayMatch[1];
          const dayVal = parseInt(monthDayMatch[2], 10);
          if (monthName in monthMap) {
            const d = new Date();
            d.setFullYear(2026);
            d.setMonth(monthMap[monthName]);
            d.setDate(dayVal);
            d.setHours(23, 59, 0, 0);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dayStr = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${dayStr}T23:59`;
          }
        }
        
        // Fallback: try standard parse
        try {
          const parsed = Date.parse(cleanStr);
          if (!isNaN(parsed)) {
            const d = new Date(parsed);
            if (!cleanStr.includes("202") && !cleanStr.includes("199") && !cleanStr.includes("203")) {
              d.setFullYear(2026);
            }
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dayStr = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${dayStr}T23:59`;
          }
        } catch (e) {}
        
        return "";
      };

      // Extract effort first, so we can clean it from the end of the text
      let effort: "High" | "Medium" | "Low" = "Medium";
      const effortMatch = rawContent.match(/\b(high|medium|low)\s+effort\b/i);
      if (effortMatch) {
        const matchedEffort = effortMatch[1].toLowerCase();
        if (matchedEffort === "high") effort = "High";
        else if (matchedEffort === "low") effort = "Low";
        else if (matchedEffort === "medium") effort = "Medium";
      }

      // Clean the effort phrase out of the string if present
      let contentNoEffort = rawContent;
      if (effortMatch) {
        contentNoEffort = rawContent.replace(/\bwith\s+(?:high|medium|low)\s+effort\b/i, "")
                                    .replace(/\b(?:high|medium|low)\s+effort\b/i, "")
                                    .trim();
      }

      // Extract deadline
      let deadline = "";
      const deadlineRegex = /\b(?:deadline\s+of|deadline|due\s+of|due)\s+(.+)$/i;
      const deadlineMatch = contentNoEffort.match(deadlineRegex);
      
      let taskName = contentNoEffort;
      if (deadlineMatch) {
        const rawDeadline = deadlineMatch[1].trim();
        deadline = parseDeadlineDate(rawDeadline);
        
        const deadlineKeywordIndex = contentNoEffort.search(/\b(?:deadline\s+of|deadline|due\s+of|due)\b/i);
        if (deadlineKeywordIndex !== -1) {
          taskName = contentNoEffort.substring(0, deadlineKeywordIndex).trim();
        }
      }
      
      // Clean up taskName trailing "and", "with"
      taskName = taskName.replace(/\s+and$/i, "")
                         .replace(/\s+with$/i, "")
                         .replace(/['"]+/g, "")
                         .trim();

      const newTask: Task = {
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        title: taskName,
        description: "",
        deadline,
        effort,
        category: "Work",
        completed: false,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [newTask, ...prev]);
      
      const formattedDate = deadline ? formatDeadline(deadline) : "";
      const confirmText = deadline 
        ? `Added '${taskName}' with deadline ${formattedDate} ✓`
        : `Added '${taskName}' — no deadline set ✓`;

      const confirmMsg: ChatMessage = {
        id: "msg-confirm-" + Date.now(),
        sender: "clutch",
        text: confirmText,
        createdAt: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, newUserMessage, confirmMsg]);
      return;
    }

    // Normal Gemini flow
    const updatedMessages = [...chatMessages, newUserMessage];
    setChatMessages(updatedMessages);
    setIsChatThinking(true);

    try {
      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // Format tasks list for context
      const currentTasksList = tasks.map((t) => ({
        title: t.title,
        description: t.description || "",
        deadline: t.deadline || "No deadline",
        effort: t.effort,
        category: t.category,
        completed: t.completed ? "Yes" : "No",
      }));

      const systemInstruction = `You are Volt, a sharp and direct productivity assistant. 
User's name is ${userName || "User"}. Address them by name occasionally but not every message.
User's current mood: ${userMood || "None"}.
If mood is Overwhelmed: be calm, break things into small steps, be reassuring.
If mood is Tired: suggest lighter tasks first, recommend a short break before starting.
If mood is Focused: give aggressive prioritization, push them to tackle hardest task first.
If mood is Motivated: match their energy, challenge them to do more than they planned.
Current tasks: ${JSON.stringify(currentTasksList)}
Current datetime: ${new Date().toISOString()}
Be concise and specific. No generic advice.`;

      // Structure dialogue history
      const contents = updatedMessages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
      }));

      const response = await generateContentWithFallback(ai, {
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
        }
      });

      const replyText = response.text?.trim() || "I'm sorry, I couldn't formulate a response.";

      const newClutchMessage: ChatMessage = {
        id: "msg-" + (Date.now() + 1),
        sender: "clutch",
        text: replyText,
        createdAt: new Date().toISOString(),
      };

      setChatMessages((prev) => [...prev, newClutchMessage]);

    } catch (err: any) {
      console.error("Gemini chat error:", err);
      setChatError("Failed to send message. Please try again.");
    } finally {
      setIsChatThinking(false);
    }
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatThinking) return;
    const text = chatInput;
    setChatInput("");
    sendChatMessage(text);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
      title: title.trim(),
      description: description.trim(),
      deadline,
      effort,
      category,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    setTasks((prev) => [newTask, ...prev]);

    // Reset form
    setTitle("");
    setDescription("");
    setDeadline("");
    setEffort("Medium");
    setCategory("Work");
  };

  const handleToggleTask = (taskId: string) => {
    const nowStr = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed, completedAt: !t.completed ? nowStr : undefined } : t))
    );
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleStartEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditDeadline(task.deadline || "");
    setEditEffort(task.effort);
    setEditCategory(task.category);
    setEditColor(task.color || "");
  };

  const handleSaveEdit = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              title: editTitle.trim(),
              description: editDescription.trim(),
              deadline: editDeadline,
              effort: editEffort,
              category: editCategory,
              color: editColor,
            }
          : t
      )
    );
    setEditingTaskId(null);
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
  };

  const formatDeadline = (deadlineStr: string) => {
    if (!deadlineStr) return "";
    try {
      const date = new Date(deadlineStr);
      return (
        date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        }) +
        " " +
        date.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    } catch {
      return deadlineStr;
    }
  };

  const filteredTasks = taskCategoryFilter === "All" 
    ? tasks 
    : tasks.filter(t => t.category === taskCategoryFilter);

  const handleAnalyzeTasks = async () => {
    if (filteredTasks.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // Prepare a clean payload of current tasks to minimize context token usage
      const taskPayload = filteredTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        deadline: t.deadline,
        effort: t.effort,
        category: t.category,
        completed: t.completed,
      }));

      const promptText = `You are a productivity assistant. Analyze these tasks and return a JSON array with the same tasks but add these fields to each: priorityRank (number, 1 = most urgent), priorityReason (one short sentence explaining why), isAtRisk (true if deadline is within 24 hours OR effort is High and deadline is within 48 hours). Tasks: ${JSON.stringify(taskPayload)}. Return only valid JSON, no extra text.`;

      const response = await generateContentWithFallback(ai, {
        model: "gemini-3.5-flash",
        contents: promptText,
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text?.trim() || "";
      if (!responseText) {
        throw new Error("Empty response from AI prioritizing assistant.");
      }

      const parsedJSON = JSON.parse(responseText);
      let parsedArray: any[] = [];
      if (Array.isArray(parsedJSON)) {
        parsedArray = parsedJSON;
      } else if (parsedJSON && typeof parsedJSON === "object") {
        const foundArray = Object.values(parsedJSON).find((val) => Array.isArray(val));
        if (foundArray) {
          parsedArray = foundArray as any[];
        }
      }

      if (parsedArray.length === 0) {
        throw new Error("Could not parse an array from AI prioritization response.");
      }

      setTasks((prevTasks) => {
        return prevTasks.map((existing) => {
          const aiTask = parsedArray.find(
            (item: any) => item.id === existing.id || item.title === existing.title
          );
          if (aiTask) {
            return {
              ...existing,
              priorityRank: typeof aiTask.priorityRank === "number" ? aiTask.priorityRank : undefined,
              priorityReason: typeof aiTask.priorityReason === "string" ? aiTask.priorityReason : undefined,
              isAtRisk: typeof aiTask.isAtRisk === "boolean" ? aiTask.isAtRisk : false,
            };
          }
          return existing;
        });
      });

    } catch (err: any) {
      console.error("Gemini analysis error:", err);
      setAnalysisError("Failed to prioritize tasks with AI. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGeneratePlan = async () => {
    setIsGeneratingPlan(true);
    setPlanError(null);

    try {
      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const uncompletedTasks = tasks.filter(t => !t.completed);
      const tasksStr = uncompletedTasks.length > 0
        ? uncompletedTasks.map((t, idx) => `${idx + 1}. Title: ${t.title}${t.description ? `, Description: ${t.description}` : ""}${t.deadline ? `, Deadline: ${t.deadline}` : ""}, Effort Level: ${t.effort}, Category: ${t.category}`).join("\n")
        : "None (no active tasks). Plan a general productive day for the user.";

      let habitsPrompt = "";
      if (includeHabitsInPlan) {
        const habitsRaw = localStorage.getItem('clutch_habits') 
          || localStorage.getItem('clutch-habits') 
          || localStorage.getItem('habits')
          || localStorage.getItem('clutchHabits')
          || '[]';
        const parsedHabits = JSON.parse(habitsRaw);
        
        const today = new Date().toISOString().split('T')[0];
        
        const incompleteHabits = parsedHabits.filter((h: any) => {
          const completedList = h.history || h.completedDates || [];
          return !completedList.includes(today);
        });
        
        if (incompleteHabits.length > 0) {
          habitsPrompt = `
  Also schedule these habits as dedicated time blocks:
  ${incompleteHabits.map((h: any) => 
    `- Habit: ${h.name}, Duration: ${h.targetDuration || h.duration || 'Not specified'}, Frequency: ${h.frequency}`
  ).join('\n')}
  Label each as "Habit: [name]" in the schedule.`;
        }
      }

      const promptText = `You are a personal productivity coach. Create a realistic hour-by-hour day plan for the user. 
User's day starts at: ${dayStart}
User's day ends at: ${dayEnd}
Fixed events today: ${fixedEvents || "None specified"}
Work style preference: ${workStyle}
Current date and time: ${time.toISOString()}
Tasks to complete:
${tasksStr}${habitsPrompt}

Rules for the plan:
STRICT RULE: Only schedule the following in the day plan:
1. Tasks explicitly provided by the user from their task list
2. Events from Google Calendar that were synced
3. Habits explicitly provided by the user (if any)
4. Meal breaks and snacks at these default times (UNLESS the user explicitly mentioned different times in their fixed events):
   - Breakfast: within 30 mins of the user's day start time
   - Lunch: 1:00 PM - 2:00 PM
   - Evening snack (optional): 5:00 PM - 5:30 PM
   - Dinner: 9:00 PM - 10:00 PM
4. Short rest breaks between work blocks

DO NOT invent, suggest, or add any tasks, activities, or work blocks that are not in the user's task list or calendar events.
If there are empty gaps in the day with no tasks to fill, leave them as free time blocks labeled 'Free Time' rather than inventing activities.

- Respect all fixed events, do not schedule tasks over them
- Schedule harder/high effort tasks in morning when energy is high
- Flag any task that cannot fit in today with a warning (e.g. "WARNING: [Task Title] could not fit in today's plan.")
- End with a short motivational message

Format each block EXACTLY like this using 12-hour format with AM/PM (e.g., 8:00 AM - 9:00 AM or 1:00 PM - 2:00 PM):
[TIME AM/PM] - [TIME AM/PM] | [TASK OR ACTIVITY] | [Brief note]

Example:
8:00 AM - 9:00 AM | Breakfast | Eat a healthy breakfast to power up your morning
9:00 AM - 10:30 AM | Tasks: Write Code | High effort study/work session
10:30 AM - 10:45 AM | Break | Stretch and hydrate
12:00 PM - 1:00 PM | Lunch | Relax and take a screen break

Do not use bold characters, lists, or bullets on the time block rows. Keep warnings and the final motivational message on their own separate lines.`;

      const response = await generateContentWithFallback(ai, {
        model: "gemini-3.5-flash",
        contents: promptText,
      });

      const responseText = response.text?.trim() || "";
      if (!responseText) {
        throw new Error("No day plan returned from Gemini.");
      }

      setPlannerOutput(responseText);
      try {
        localStorage.setItem("clutch_day_plan", responseText);
      } catch {}

    } catch (err: any) {
      console.error("Day planner generation error:", err);
      setPlanError("Failed to generate day plan. Please try again.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleStartPlanning = async () => {
    setIsFetchingCalendarForForm(true);
    let autoFilled = false;
    
    let activeToken = accessToken;
    if (!activeToken) {
      try {
        activeToken = localStorage.getItem("clutch_google_cal_token");
      } catch (e) {
        console.error("Failed to read token from localStorage:", e);
      }
    }

    if (activeToken) {
      try {
        console.log("Automatically fetching calendar events before showing the context form...");
        const d = new Date();
        const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        const endD = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

        const params = new URLSearchParams({
          timeMin: startD.toISOString(),
          timeMax: endD.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
        });

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${activeToken}`,
            },
          }
        );

        if (res.ok) {
          const data = await res.json();
          const events = data.items || [];
          setCalendarEvents(events);

          if (events.length > 0) {
            const formatted = events
              .filter((e: any) => e.summary)
              .map((e: any) => {
                const summary = e.summary;
                let timePart = "";
                if (e.start?.dateTime) {
                  const startEvent = new Date(e.start.dateTime);
                  let hours = startEvent.getHours();
                  const minutes = String(startEvent.getMinutes()).padStart(2, "0");
                  const ampm = hours >= 12 ? "PM" : "AM";
                  hours = hours % 12;
                  if (hours === 0) hours = 12;
                  timePart = ` at ${hours}:${minutes} ${ampm}`;
                } else if (e.start?.date) {
                  timePart = " (all day)";
                }
                return `${summary}${timePart}`;
              })
              .join(", ");

            setFixedEvents(formatted);
            autoFilled = true;
            setIsAutoFilledFromCalendar(true);
            console.log("Successfully auto-filled fixed events:", formatted);
          } else {
            console.log("No calendar events today.");
          }
        } else {
          console.warn("Failed to fetch calendar events automatically:", res.status);
        }
      } catch (err) {
        console.error("Automatic calendar fetch failed:", err);
      }
    } else {
      console.log("Calendar is not connected, proceeding with empty fixed events.");
    }

    if (!autoFilled) {
      setIsAutoFilledFromCalendar(false);
    }
    
    setIsFetchingCalendarForForm(false);
    setShowPlannerForm(true);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const formattedDate = time.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const taskScoreDetails = useMemo(() => {
    let score = 100;
    let overdueTasks = 0;
    let atRiskCount = riskAlerts.length;
    let completedTasks = 0;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    tasks.forEach(t => {
      if (t.completed) {
        completedTasks++;
      } else if (t.deadline) {
        const dlStr = t.deadline.split("T")[0];
        if (dlStr < todayStr) {
          overdueTasks++;
        }
      }
    });

    let taskDonePoints = completedTasks * 10;
    let overduePenalty = overdueTasks * 15;
    let riskPenalty = atRiskCount * 10;

    score += taskDonePoints - overduePenalty - riskPenalty;
    score = Math.max(0, Math.min(100, score));

    let color = "text-red-600";
    let bg = "bg-red-500";
    let border = "border-red-200";
    let message = "Volt time!";
    if (score >= 80) {
      color = "text-green-600";
      bg = "bg-green-500";
      border = "border-green-200";
      message = "Crushing it";
    } else if (score >= 50) {
      color = "text-yellow-600";
      bg = "bg-yellow-500";
      border = "border-yellow-200";
      message = "Stay focused";
    }

    return {
      score,
      taskDonePoints,
      overduePenalty,
      riskPenalty,
      color,
      bg,
      border,
      message
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, riskAlerts]);

  const habitScoreDetails = useMemo(() => {
    let score = 100;
    let brokenStreakHabits = 0;
    let completedHabits = 0;
    let activeStreakCount = 0;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    habits.forEach(h => {
      const doneToday = h.history.includes(todayStr);
      if (doneToday) {
        completedHabits++;
      }
      const streak = calculateStreakForHabit(h.history, todayStr);
      if (streak === 0 && !doneToday) {
        brokenStreakHabits++;
      }
      if (streak > 0) {
        activeStreakCount++;
      }
    });

    let habitDonePoints = completedHabits * 5;
    let activeStreakPoints = activeStreakCount * 5;
    let brokenHabitPenalty = brokenStreakHabits * 10;

    score += habitDonePoints + activeStreakPoints - brokenHabitPenalty;
    score = Math.max(0, Math.min(100, score));

    let color = "text-red-600";
    let bg = "bg-red-500";
    let border = "border-red-200";
    let message = "Volt time!";
    if (score >= 80) {
      color = "text-green-600";
      bg = "bg-green-500";
      border = "border-green-200";
      message = "Crushing it";
    } else if (score >= 50) {
      color = "text-yellow-600";
      bg = "bg-yellow-500";
      border = "border-yellow-200";
      message = "Stay focused";
    }

    return {
      score,
      habitDonePoints,
      activeStreakPoints,
      brokenHabitPenalty,
      color,
      bg,
      border,
      message
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits]);

  if (!userName) {
    return (
      <div 
        className="min-h-screen w-full flex flex-col items-center justify-center p-6 select-none relative overflow-hidden font-sans"
        style={{ backgroundColor: "#0f0b09" }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
        `}</style>

        {/* Minimal ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#cde5a3]/[0.02] blur-[120px] pointer-events-none rounded-full" />
        
        <div className={`w-full max-w-[420px] mx-auto bg-[#130e0c] border border-[#ffffff0a] rounded-[24px] p-8 sm:p-10 flex flex-col items-center transition-opacity duration-300 z-10 shadow-2xl ${isTransitioningStep ? "opacity-0" : "opacity-100 animate-in fade-in slide-in-from-bottom-4 duration-700"}`}>
          
          {/* Title with Logo */}
          <div className="flex items-center gap-4 mb-6 mt-4">
            <div className="w-[52px] h-[52px] bg-gradient-to-b from-[#8eb57b] to-[#b3d79b] rounded-[16px] flex items-center justify-center shadow-[0_0_40px_rgba(153,193,124,0.15)] shrink-0">
              <Zap className="w-6 h-6 text-[#150f0c]" fill="currentColor" />
            </div>
            <h1 className="text-[56px] font-bold text-[#f2ecd9] leading-none tracking-tight" style={{ fontFamily: '"Playfair Display", serif' }}>
              Volt
            </h1>
          </div>

          {/* Subtitle */}
          <div className="flex items-center w-full gap-3 mb-10">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#ffffff15] to-[#ffffff15]"></div>
            <span className="text-[10px] text-[#7a9364] font-dm tracking-[0.15em] uppercase font-bold whitespace-nowrap">
              Your last-minute life saver
            </span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#ffffff15] to-[#ffffff15]"></div>
          </div>

          {/* Input Area */}
          <div className="w-full flex flex-col space-y-3 mb-6">
            <label className="text-[10px] text-[#756855] font-dm font-bold uppercase tracking-[0.15em] leading-none text-left w-full pl-1">
              What should I call you?
            </label>
            <input
              id="onboarding-name-input"
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tempName.trim()) {
                  setIsTransitioningStep(true);
                  setTimeout(() => {
                    handleFinishOnboarding();
                    setIsTransitioningStep(false);
                  }, 300);
                }
              }}
              placeholder="Type your name..."
              className="w-full bg-[#18120e] border border-[#ffffff0a] rounded-xl px-5 py-4 text-[#f2ecd9] font-dm text-[15px] placeholder:text-[#f2ecd9]/30 focus:outline-none focus:border-[#c09d6c]/40 transition-colors"
              autoFocus
            />
          </div>

          {/* Button */}
          <button
            id="button-welcome-next"
            type="button"
            disabled={!tempName.trim()}
            onClick={() => {
              if (tempName.trim()) {
                setIsTransitioningStep(true);
                setTimeout(() => {
                  handleFinishOnboarding();
                  setIsTransitioningStep(false);
                }, 300);
              }
            }}
            className={`w-full py-4 bg-[#231d16] font-dm font-bold text-[14px] rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              tempName.trim() ? "hover:bg-[#dcf4bc] hover:text-[#150f0c] text-[#f2ecd9] active:scale-[0.98] cursor-pointer" : "text-[#594e3e] opacity-90 cursor-not-allowed"
            }`}
          >
            Let's Go
          </button>

          {/* Footer */}
          <span className="text-[10px] text-[#4d4133] font-dm font-medium text-center mt-6 tracking-wide mb-6">
            When it's due, Volt pulls through.
          </span>
          
          <button
            id="button-welcome-demo"
            type="button"
            onClick={handleLoadDemoData}
            className="text-[11px] text-[#f2ecd9]/40 hover:text-[#f2ecd9] font-dm font-medium underline bg-transparent border-0 cursor-pointer transition-colors"
          >
            Or explore with demo data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="app-root" 
      className="min-h-screen text-[#f2ecd9] font-sans antialiased flex flex-row relative overflow-hidden"
      style={{ backgroundColor: "#0f0b09" }}
    >
      {/* Minimal ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#cde5a3]/[0.02] blur-[120px] pointer-events-none rounded-full z-0" />
      
      {/* Main layout wrapper */}
      <div className="relative z-10 flex flex-row w-full h-full">
        {/* Sidebar Navigation */}
        <aside className={`fixed inset-y-0 left-0 bg-[#200F07] border-r border-[rgba(255,249,235,0.15)] flex flex-col z-40 transition-all duration-300 ease-in-out overflow-hidden ${
          isSidebarCollapsed ? "w-12" : "w-12 md:w-[240px]"
        }`}>
        {/* Top Logo Section */}
        <div className={`relative border-b border-[rgba(255,249,235,0.15)] flex items-center transition-all duration-300 ${
          isSidebarCollapsed ? "p-3.5 justify-center" : "p-3 md:p-6 justify-between md:justify-start gap-3"
        }`}>
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 md:w-6 md:h-6 text-[#C5E384] shrink-0 animate-pulse" />
            {!isSidebarCollapsed && (
              <div className="hidden md:block">
                <h1 id="app-logo" className="text-[22px] font-bold font-space text-[#FFF9EB] tracking-tight">Volt</h1>
                <p id="app-tagline" className="text-xs text-[#C5E384] font-dm font-medium tracking-wide">
                  Your last-minute life saver
                </p>
              </div>
            )}
          </div>
          
          {/* Toggle Button */}
          <button
            id="button-toggle-sidebar"
            type="button"
            onClick={toggleSidebar}
            className={`absolute ${isSidebarCollapsed ? "top-2.5 right-2" : "top-3.5 md:top-5 right-2"} p-1 rounded text-[#FFF9EB]/60 hover:text-[#FFF9EB] hover:bg-[rgba(255,249,235,0.1)] transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center z-50`}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? (
              <ArrowRight size={15} />
            ) : (
              <Menu size={15} />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className={`flex-1 py-4 space-y-1 overflow-y-auto flex flex-col items-center transition-all ${
          isSidebarCollapsed ? "px-1" : "px-1 md:px-4 md:items-stretch"
        }`}>
          <button
            id="tab-task-manager"
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center transition-colors text-xs uppercase tracking-wider font-bold cursor-pointer font-dm ${
              isSidebarCollapsed 
                ? "w-10 h-10 p-2.5 rounded-lg justify-center" 
                : "w-10 md:w-full justify-center md:justify-start gap-3 p-2.5 md:px-3 md:py-2 rounded-lg"
            } ${
              activeTab === "tasks"
                ? "bg-[#C5E384] text-[#200F07]"
                : "text-[#FFF9EB]/90 bg-transparent hover:bg-[rgba(197,227,132,0.15)] hover:text-[#C5E384]"
            }`}
            title="Task Manager"
          >
            <ListTodo className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="hidden md:block text-left truncate">Task Manager</span>}
          </button>

          <button
            id="tab-habits-goals"
            type="button"
            onClick={() => setActiveTab("habits")}
            className={`flex items-center transition-colors text-xs uppercase tracking-wider font-bold cursor-pointer font-dm ${
              isSidebarCollapsed 
                ? "w-10 h-10 p-2.5 rounded-lg justify-center" 
                : "w-10 md:w-full justify-center md:justify-start gap-3 p-2.5 md:px-3 md:py-2 rounded-lg"
            } ${
              activeTab === "habits"
                ? "bg-[#C5E384] text-[#200F07]"
                : "text-[#FFF9EB]/90 bg-transparent hover:bg-[rgba(197,227,132,0.15)] hover:text-[#C5E384]"
            }`}
            title="Habits & Goals"
          >
            <Target className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="hidden md:block text-left truncate">Habits & Goals</span>}
          </button>

          <button
            id="tab-day-planner"
            type="button"
            onClick={() => setActiveTab("day_planner")}
            className={`flex items-center transition-colors text-xs uppercase tracking-wider font-bold cursor-pointer font-dm ${
              isSidebarCollapsed 
                ? "w-10 h-10 p-2.5 rounded-lg justify-center" 
                : "w-10 md:w-full justify-center md:justify-start gap-3 p-2.5 md:px-3 md:py-2 rounded-lg"
            } ${
              activeTab === "day_planner"
                ? "bg-[#C5E384] text-[#200F07]"
                : "text-[#FFF9EB]/90 bg-transparent hover:bg-[rgba(197,227,132,0.15)] hover:text-[#C5E384]"
            }`}
            title="Day Planner"
          >
            <Calendar className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="hidden md:block text-left truncate">Day Planner</span>}
          </button>

          <button
            id="tab-focus-room"
            type="button"
            onClick={() => setActiveTab("focus_room")}
            className={`flex items-center transition-colors text-xs uppercase tracking-wider font-bold cursor-pointer font-dm ${
              isSidebarCollapsed 
                ? "w-10 h-10 p-2.5 rounded-lg justify-center" 
                : "w-10 md:w-full justify-center md:justify-start gap-3 p-2.5 md:px-3 md:py-2 rounded-lg"
            } ${
              activeTab === "focus_room"
                ? "bg-[#C5E384] text-[#200F07]"
                : "text-[#FFF9EB]/90 bg-transparent hover:bg-[rgba(197,227,132,0.15)] hover:text-[#C5E384]"
            }`}
            title="LOCK IN"
          >
            <Flame className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="hidden md:block text-left truncate">LOCK IN</span>}
          </button>

          <button
            id="tab-stats"
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`flex items-center transition-colors text-xs uppercase tracking-wider font-bold cursor-pointer font-dm ${
              isSidebarCollapsed 
                ? "w-10 h-10 p-2.5 rounded-lg justify-center" 
                : "w-10 md:w-full justify-center md:justify-start gap-3 p-2.5 md:px-3 md:py-2 rounded-lg"
            } ${
              activeTab === "stats"
                ? "bg-[#C5E384] text-[#200F07]"
                : "text-[#FFF9EB]/90 bg-transparent hover:bg-[rgba(197,227,132,0.15)] hover:text-[#C5E384]"
            }`}
            title="Stats"
          >
            <BarChart2 className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="hidden md:block text-left truncate">Stats</span>}
          </button>
        </nav>

        {/* Bottom Section */}
        {!isSidebarCollapsed && (
          <div className="p-2 md:p-6 border-t border-[rgba(255,249,235,0.15)] flex flex-col items-center md:items-stretch gap-4">
            <div id="live-clock" className="hidden md:flex flex-col text-[#FFF9EB] font-dm text-xs">
              <span className="font-semibold tracking-wider text-[#C5E384] font-space text-sm">{formattedTime}</span>
              <span className="text-[#FFF9EB]/70 mt-0.5">{formattedDate}</span>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("clutch_user_name");
                window.location.reload();
              }}
              className="text-[10px] text-gray-500/30 hover:text-gray-400 text-left cursor-pointer transition-colors mt-auto"
            >
              reset
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div 
        className={`relative flex-1 min-h-screen flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarCollapsed 
            ? "ml-12 w-[calc(100%-48px)]" 
            : "ml-12 md:ml-[240px] w-[calc(100%-48px)] md:w-[calc(100%-240px)]"
        }`}
        style={{
          backgroundColor: activeTab === "focus_room" 
            ? (isLockingIn ? "#0d1f0f" : "#FFF9EB")
            : "#FFF9EB"
        }}
      >
        {/* Cross-fading Nature Backgrounds */}
        {activeTab === "focus_room" && isLockingIn && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {FOCUS_BACKGROUNDS.map((bg, idx) => (
              <div
                key={bg.id}
                className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
                style={{
                  opacity: idx === focusBgIndex ? 1 : 0,
                  backgroundImage: `linear-gradient(rgba(13, 31, 15, 0.45), rgba(13, 31, 15, 0.45)), url('${bg.url}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }}
              />
            ))}
          </div>
        )}
        
        {/* Risk Alert Section */}
        {activeTab === "tasks" && riskAlerts.length > 0 && (
          <section id="section-risk-alerts" className="relative z-10 max-w-7xl w-full mx-auto px-6 sm:px-12 pt-8">
            <div className="space-y-2">
              {riskAlerts.map((alert, index) => {
                const isCritical = alert.severity === "critical";
                return (
                  <div
                    key={`risk-alert-${index}`}
                    id={`risk-alert-${index}`}
                    style={{ borderLeft: "3px solid #FF6B6B" }}
                    className="flex items-start gap-3 p-4 bg-[#FFF0F0] text-[#CC0000] rounded-r-lg border-y border-r border-[#FF6B6B]/20 text-xs leading-relaxed font-dm"
                  >
                    <span className="shrink-0 text-sm">⚠️</span>
                    <div>
                      <strong className="font-bold">{alert.taskTitle}</strong>
                      <span> — {alert.reason}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Main Grid Content */}
        <main id="app-main" className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 sm:px-12 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {activeTab === "tasks" ? (
              <>
                <div id="section-tasks" className="col-span-1 lg:col-span-3 space-y-8">
                {/* Header and Add Task Button row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-5">
                  <div>
                    <h2 className="text-[24px] font-bold tracking-tight text-[#200F07] font-space">Task Manager</h2>
                    <p className="text-[11px] text-[#200F07] font-dm uppercase tracking-[0.1em] mt-1.5">Manage & Prioritize</p>
                  </div>
                  
                  {/* Expandable Add Task Form Trigger */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsAddTaskExpanded(!isAddTaskExpanded)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#FFF9EB] hover:bg-[#C5E384] border-[1.5px] border-[#200F07] rounded text-xs font-space font-semibold text-[#200F07] transition-all cursor-pointer"
                    >
                      {isAddTaskExpanded ? (
                        <>
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          Add Task
                        </>
                      )}
                    </button>
                  </div>
              </div>

              {/* Add Task Form Panel */}
              {isAddTaskExpanded && (
                <div className="bg-[#FFF9EB] border border-[#C5E384] rounded-xl p-5 space-y-4 shadow-sm w-full">
                  <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-400">New Task details</h4>
                  </div>
                  
                  <form 
                    id="form-add-task"
                    onSubmit={(e) => {
                      handleAddTask(e);
                      setIsAddTaskExpanded(false);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-4">
                      {/* Task Title */}
                      <div>
                        <label htmlFor="input-title" className="block text-xs uppercase tracking-wider text-[#200F07] font-semibold font-dm mb-1">
                          Task Title
                        </label>
                        <input
                          id="input-title"
                          type="text"
                          required
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="What needs to get done?"
                          className="w-full px-3 py-2 border border-[#C5E384] rounded text-sm bg-[#FFF9EB] text-[#1a1a1a] placeholder:text-neutral-400 focus:outline-none focus:border-[#200F07] font-dm"
                        />
                      </div>

                      {/* Task Description */}
                      <div>
                        <label htmlFor="input-description" className="block text-xs uppercase tracking-wider text-[#200F07] font-semibold font-dm mb-1">
                          Task Description
                        </label>
                        <textarea
                          id="input-description"
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Any context? (optional)"
                          className="w-full px-3 py-2 border border-[#C5E384] rounded text-sm bg-[#FFF9EB] text-[#1a1a1a] placeholder:text-neutral-400 focus:outline-none focus:border-[#200F07] font-dm resize-none"
                        />
                      </div>

                      {/* Deadline */}
                      <div>
                        <label htmlFor="input-deadline" className="block text-xs uppercase tracking-wider text-[#200F07] font-semibold font-dm mb-1">
                          Deadline
                        </label>
                        <input
                          id="input-deadline"
                          type="datetime-local"
                          value={deadline}
                          onChange={(e) => setDeadline(e.target.value)}
                          className="w-full px-3 py-2 border border-[#C5E384] rounded text-sm bg-[#FFF9EB] text-[#1a1a1a] focus:outline-none focus:border-[#200F07] font-dm"
                        />
                        <p className="text-[10px] text-neutral-500 font-dm mt-1">
                          Enter time in 24hr format, it will display as AM/PM
                        </p>
                      </div>

                      {/* Effort & Category Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Effort Level */}
                        <div>
                          <label htmlFor="select-effort" className="block text-xs uppercase tracking-wider text-[#200F07] font-semibold font-dm mb-1">
                            Effort Level
                          </label>
                          <select
                            id="select-effort"
                            value={effort}
                            onChange={(e) => setEffort(e.target.value as Task["effort"])}
                            className="w-full px-3 py-2 border border-[#C5E384] rounded text-sm bg-[#FFF9EB] text-[#1a1a1a] focus:outline-none focus:border-[#200F07] font-dm"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </div>

                        {/* Category */}
                        <div>
                          <label htmlFor="select-category" className="block text-xs uppercase tracking-wider text-[#200F07] font-semibold font-dm mb-1">
                            Category
                          </label>
                          <select
                            id="select-category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value as Task["category"])}
                            className="w-full px-3 py-2 border border-[#C5E384] rounded text-sm bg-[#FFF9EB] text-[#1a1a1a] focus:outline-none focus:border-[#200F07] font-dm"
                          >
                            <option value="Work">Work</option>
                            <option value="Study">Study</option>
                            <option value="Personal">Personal</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddTaskExpanded(false)}
                        className="px-4 py-2 border border-[#C5E384] hover:bg-[#C5E384]/20 rounded text-xs font-space font-semibold uppercase tracking-wider text-[#200F07] transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        id="button-add-task-submit"
                        type="submit"
                        disabled={!title.trim()}
                        className="px-4 py-2 bg-[#200F07] hover:bg-[#200F07]/90 disabled:opacity-50 disabled:cursor-not-allowed text-[#C5E384] text-xs font-space font-bold uppercase tracking-wider rounded transition-all cursor-pointer"
                      >
                        Save Task
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* My Tasks Section */}
              <div id="section-my-tasks">

            {/* Task Category Filter Bar */}
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {["All", "Work", "Study", "Personal", "Other"].map((cat) => {
                const count = cat === "All" 
                  ? tasks.length 
                  : tasks.filter(t => t.category === cat).length;
                
                const isSelected = taskCategoryFilter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setTaskCategoryFilter(cat as any)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors border font-dm flex items-center gap-1.5 cursor-pointer ${
                      isSelected 
                        ? "bg-[#200F07] text-[#FFF9EB] border-[#200F07]" 
                        : "bg-[#FFF9EB] text-[#200F07] border-[#200F07] hover:bg-[#C5E384]/30"
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="bg-[#C5E384] text-[#200F07] font-bold px-1.5 py-0.5 rounded-full text-[10px] min-w-[18px] text-center font-dm">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* AI Prioritization Controls */}
            {filteredTasks.length > 0 && (
              <div id="ai-controls" className="mb-4 flex flex-col gap-2">
                <button
                  id="button-ai-prioritize"
                  type="button"
                  onClick={handleAnalyzeTasks}
                  disabled={isAnalyzing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#200F07] hover:bg-[#200F07]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-space text-xs font-semibold uppercase tracking-wider text-[#C5E384] rounded-[8px] cursor-pointer shadow-sm active:translate-y-[1px]"
                >
                  {isAnalyzing ? (
                    <>
                      <Sparkles size={14} className="animate-spin text-[#C5E384]" />
                      <span>Analysing your tasks...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-[#C5E384]" />
                      <span>Analyse & Prioritize</span>
                    </>
                  )}
                </button>
                {analysisError && (
                  <div
                    id="analysis-error"
                    className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 p-2.5 rounded text-center"
                  >
                    {analysisError}
                  </div>
                )}
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div 
                id="placeholder-my-tasks" 
                className="flex-1 min-h-[350px] border border-dashed border-neutral-200 rounded-lg flex flex-col items-center justify-center p-8 text-neutral-400 bg-neutral-50/30"
              >
                <span className="text-xs font-mono tracking-wider text-neutral-400">
                  {taskCategoryFilter === "All" 
                    ? "No tasks yet. Add one above." 
                    : `No ${taskCategoryFilter} tasks yet.`}
                </span>
              </div>
            ) : (
              <div id="tasks-list" className="flex-1 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {[...filteredTasks]
                  .sort((a, b) => {
                    // 1. Completed tasks always go to the bottom
                    if (a.completed !== b.completed) {
                      return a.completed ? 1 : -1;
                    }
                    
                    // 2. Sort by priorityRank if available
                    const hasRankA = typeof a.priorityRank === "number";
                    const hasRankB = typeof b.priorityRank === "number";
                    
                    if (hasRankA && hasRankB) {
                      return a.priorityRank! - b.priorityRank!;
                    }
                    if (hasRankA && !hasRankB) return -1;
                    if (!hasRankA && hasRankB) return 1;
                    
                    // 3. Fallback to createdAt descending
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  })
                  .map((task) => (
                    <div 
                      key={task.id}
                      id={`task-card-${task.id}`}
                      onClick={() => {
                        if (editingTaskId !== task.id) {
                          handleStartEditing(task);
                        }
                      }}
                      style={task.color ? { borderLeft: `4px solid ${task.color}` } : undefined}
                      className={`p-4 border flex items-start gap-3 bg-[#FFF9EB] transition-all ${
                        editingTaskId === task.id ? "cursor-default" : "cursor-pointer"
                      } ${
                        task.completed 
                          ? "border-[#C5E384] opacity-60 rounded-[12px]" 
                          : "border-[#C5E384] rounded-[12px] shadow-[0_2px_8px_rgba(32,15,7,0.06)] hover:border-[#200F07]"
                      }`}
                    >
                      {editingTaskId === task.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveEdit(task.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full space-y-3"
                        >
                          {/* Title */}
                          <div className="space-y-1">
                            <label className="block text-[10px] font-dm uppercase tracking-wider text-[#200F07] font-semibold">Title</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-[#C5E384] rounded text-xs bg-[#FFF9EB] text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                              required
                            />
                          </div>

                          {/* Description */}
                          <div className="space-y-1">
                            <label className="block text-[10px] font-dm uppercase tracking-wider text-[#200F07] font-semibold">Description</label>
                            <textarea
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-[#C5E384] rounded text-xs bg-[#FFF9EB] text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm min-h-[60px] resize-y"
                            />
                          </div>

                          {/* Grid for Deadline, Effort, Category */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <label className="block text-[10px] font-dm uppercase tracking-wider text-[#200F07] font-semibold">Deadline</label>
                              <input
                                type="datetime-local"
                                value={editDeadline}
                                onChange={(e) => setEditDeadline(e.target.value)}
                                className="w-full px-2 py-1 border border-[#C5E384] rounded text-xs bg-[#FFF9EB] text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] font-dm uppercase tracking-wider text-[#200F07] font-semibold">Effort</label>
                              <select
                                value={editEffort}
                                onChange={(e) => setEditEffort(e.target.value as any)}
                                className="w-full px-2 py-1 border border-[#C5E384] rounded text-xs bg-[#FFF9EB] text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] font-dm uppercase tracking-wider text-[#200F07] font-semibold">Category</label>
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value as any)}
                                className="w-full px-2 py-1 border border-[#C5E384] rounded text-xs bg-[#FFF9EB] text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                              >
                                <option value="Work">Work</option>
                                <option value="Study">Study</option>
                                <option value="Personal">Personal</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>

                          {/* Tag Color option row */}
                          <div className="space-y-1.5 pt-1">
                            <label className="block text-[10px] font-dm uppercase tracking-wider text-[#200F07] font-semibold">Tag Color</label>
                            <div className="flex flex-wrap items-center gap-2">
                              {[
                                { value: "", bg: "bg-[#FFF9EB] border-[#C5E384] border" },
                                { value: "#EF4444", bg: "bg-[#EF4444]" },
                                { value: "#F97316", bg: "bg-[#F97316]" },
                                { value: "#EAB308", bg: "bg-[#EAB308]" },
                                { value: "#22C55E", bg: "bg-[#22C55E]" },
                                { value: "#3B82F6", bg: "bg-[#3B82F6]" },
                                { value: "#A855F7", bg: "bg-[#A855F7]" },
                              ].map((c) => (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={() => setEditColor(c.value)}
                                  className={`w-6 h-6 rounded-full ${c.bg} transition-all relative shrink-0 cursor-pointer ${
                                    editColor === c.value ? "ring-2 ring-[#200F07] ring-offset-1 scale-110" : "hover:scale-105"
                                  }`}
                                  title={c.value ? `Color ${c.value}` : "None"}
                                >
                                  {c.value === "" && (
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-500 font-bold">∅</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#C5E384]/30">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-3 py-1.5 border border-[#C5E384] hover:bg-[#C5E384]/20 text-[11px] font-space font-semibold uppercase tracking-wider rounded text-[#200F07] transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-4 py-1.5 bg-[#200F07] text-[#C5E384] text-[11px] font-space font-bold uppercase tracking-wider rounded hover:opacity-90 transition-colors cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {/* Checkbox */}
                          <button
                            id={`task-check-${task.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTask(task.id);
                            }}
                            className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                              task.completed
                                ? "bg-[#200F07] border-[#200F07] text-[#FFF9EB]"
                                : "border-[#C5E384] hover:border-[#200F07] bg-transparent"
                            }`}
                          >
                            {task.completed && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#C5E384] block" />
                            )}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 
                                id={`task-title-${task.id}`}
                                className={`text-sm font-semibold truncate leading-tight font-space ${
                                  task.completed ? "line-through text-[#200F07]/40" : "text-[#200F07]"
                                }`}
                              >
                                {task.title}
                              </h3>
                              {/* Delete Button */}
                              <button
                                id={`task-delete-${task.id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTask(task.id);
                                }}
                                className="text-neutral-400 hover:text-[#200F07] transition-colors p-0.5 rounded hover:bg-[#C5E384]/20 cursor-pointer shrink-0"
                                title="Delete Task"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            {task.description && (
                              <p 
                                id={`task-desc-${task.id}`}
                                className={`text-[14px] mt-1 break-words font-dm ${
                                  task.completed ? "line-through text-[#200F07]/40" : "text-[#200F07]/80"
                                }`}
                              >
                                {task.description}
                              </p>
                            )}

                            {task.priorityReason && !task.completed && (
                              <p 
                                id={`task-ai-reason-${task.id}`}
                                className="text-[11px] italic mt-1.5 text-[#200F07]/70 font-dm border-l-2 border-[#C5E384] pl-2 py-0.5 leading-relaxed"
                              >
                                Why: {task.priorityReason}
                              </p>
                            )}

                            {/* Badges & Deadline */}
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              {/* AI Priority badge */}
                              {typeof task.priorityRank === "number" && !task.completed && (
                                <span 
                                  id={`task-badge-ai-rank-${task.id}`}
                                  className="bg-[#200F07] text-[#C5E384] font-space font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider flex items-center gap-1 shrink-0"
                                >
                                  <Sparkles size={8} className="fill-[#C5E384] text-[#C5E384]" />
                                  Rank #{task.priorityRank}
                                </span>
                              )}

                              {/* At Risk badge */}
                              {task.isAtRisk && !task.completed && (
                                <span 
                                  id={`task-badge-at-risk-${task.id}`}
                                  className="bg-[#FF6B6B] text-white px-2 py-0.5 rounded text-[10px] font-dm uppercase tracking-wider font-semibold shrink-0"
                                >
                                  At Risk
                                </span>
                              )}

                              <span 
                                id={`task-badge-category-${task.id}`}
                                className="bg-[#C5E384] text-[#200F07] px-2.5 py-0.5 rounded-[20px] text-[12px] font-dm shrink-0 font-medium"
                              >
                                {task.category}
                              </span>
                              <span 
                                id={`task-badge-effort-${task.id}`}
                                className="bg-[#C5E384] text-[#200F07] px-2.5 py-0.5 rounded-[20px] text-[12px] font-dm shrink-0 font-medium"
                              >
                                {task.effort} Effort
                              </span>
                              {task.deadline && (
                                <span 
                                  id={`task-deadline-text-${task.id}`}
                                  className="text-[13px] font-dm text-[#200F07]/80 ml-auto whitespace-nowrap font-medium"
                                >
                                  Due: {formatDeadline(task.deadline)}
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}
            </div>
            </div>
            </>
          ) : activeTab === "day_planner" ? (
            <div id="section-day-planner-wrapper" className="col-span-1 lg:col-span-3 w-full space-y-8">

          {/* Day Planner Section */}
          <section id="section-day-planner" className="flex flex-col h-full">
            <div className="mb-4">
              <h2 id="heading-day-planner" className="text-lg font-bold tracking-tight text-[#200F07] font-space">
                Day Planner
              </h2>
            </div>

            {/* Google Calendar Connection Card */}
            <div id="google-calendar-card" className="mb-4 border border-[#C5E384] rounded-lg p-4 bg-[#FFF9EB] shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#200F07]" />
                  <span className="text-xs font-dm uppercase tracking-wider font-bold text-[#200F07]">
                    Google Calendar
                  </span>
                </div>
                {user ? (
                  <button
                    id="button-calendar-disconnect"
                    type="button"
                    onClick={handleDisconnectCalendar}
                    className="text-[10px] font-dm text-[#200F07]/60 hover:text-red-600 transition-colors cursor-pointer flex items-center gap-1 border-0 bg-transparent"
                  >
                    <LogOut className="w-3 h-3" /> Disconnect
                  </button>
                ) : null}
              </div>

              {!user ? (
                <div className="mt-3">
                  <p className="text-xs text-[#200F07]/80 leading-normal mb-3 font-dm">
                    Connect your Google Calendar to sync your today's fixed events automatically and export your optimized day plan.
                  </p>
                  <button
                    id="button-calendar-connect"
                    type="button"
                    onClick={handleConnectCalendar}
                    className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-[#FFF9EB] hover:bg-[#C5E384] border border-[#200F07] rounded text-xs font-space font-semibold text-[#200F07] transition-all cursor-pointer shadow-xs"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M5.26620003,9.76453112 C6.19878753,6.9381228 8.85981253,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.30909091,0 3.28181818,2.69090909 1.34545455,6.62727273 L5.26620003,9.76453112 Z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.4909091,12.2727273 C23.4909091,11.4181818 23.4181818,10.6545455 23.2727273,9.90909091 L12,9.90909091 L12,14.5636364 L18.4727273,14.5636364 C18.1818182,16.0363636 17.3454545,17.2909091 16.0909091,18.1272727 L19.9818182,21.1454545 C22.2545455,19.0545455 23.4909091,15.9454545 23.4909091,12.2727273 Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.26620003,14.2354689 L1.34545455,17.3727273 C3.28181818,21.3090909 7.30909091,24 12,24 C15.0545455,24 17.7818182,22.9545455 19.9818182,21.1454545 L16.0909091,18.1272727 C15.0181818,18.8454545 13.6363636,19.2727273 12,19.2727273 C8.85981253,19.2727273 6.19878753,17.2436954 5.26620003,14.2354689 Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12,19.2727273 C13.6363636,19.2727273 15.0181818,18.8454545 16.0909091,18.1272727 L19.9818182,21.1454545 C17.7818182,22.9545455 15.0545455,24 12,24 C7.30909091,24 3.28181818,21.3090909 1.34545455,17.3727273 L5.26620003,14.2354689 C6.19878753,17.2436954 8.85981253,19.2727273 12,19.2727273 Z"
                      />
                    </svg>
                    Connect Google Calendar
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between text-xs font-dm">
                    <span className="text-[#200F07]/70">
                      Connected as <strong className="text-[#200F07] font-bold">{user.email}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#200F07] bg-[#C5E384] px-1.5 py-0.5 rounded border border-[#200F07]/20 font-bold uppercase">
                      ● active
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      id="button-sync-events"
                      type="button"
                      onClick={() => handleSyncTodayEvents()}
                      disabled={isSyncingCalendar}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-[#200F07] hover:bg-[#200F07]/90 text-[#C5E384] disabled:opacity-50 rounded text-xs font-space font-semibold transition-colors cursor-pointer border-0"
                    >
                      <RefreshCw size={12} className={isSyncingCalendar ? "animate-spin" : ""} />
                      {isSyncingCalendar ? "Syncing..." : "Sync Today's Events"}
                    </button>
                  </div>

                  {calendarEvents.length > 0 && (
                    <div className="border-t border-[#C5E384]/30 pt-2">
                      <button
                        id="button-toggle-events-list"
                        type="button"
                        onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
                        className="w-full flex items-center justify-between text-[11px] font-dm text-[#200F07]/60 hover:text-[#200F07] transition-colors border-0 bg-transparent cursor-pointer font-bold"
                      >
                        <span>TODAY'S SCHEDULE ({calendarEvents.length})</span>
                        {isCalendarExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {isCalendarExpanded && (
                        <div className="mt-2 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                          {calendarEvents.map((evt: any, i) => {
                            let formattedTime = "All Day";
                            if (evt.start?.dateTime) {
                              const startD = new Date(evt.start.dateTime);
                              const endD = new Date(evt.end.dateTime);
                              formattedTime = `${startD.toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })} - ${endD.toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}`;
                            }
                            return (
                              <div
                                key={`cal-evt-${i}`}
                                className="flex items-start justify-between gap-2 p-1.5 rounded bg-[#FFF9EB] border border-[#C5E384] text-[11px] font-dm"
                              >
                                <span className="font-bold text-[#200F07] truncate max-w-[130px]" title={evt.summary}>
                                  {evt.summary}
                                </span>
                                <span className="text-[#200F07]/60 shrink-0 text-[10px]">
                                  {formattedTime}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {calendarError && (
                <div className="mt-2 text-[10px] font-dm text-red-600 bg-red-50 border border-red-100 p-2 rounded text-center">
                  {calendarError}
                </div>
              )}
            </div>

            {isGeneratingPlan ? (
              <div 
                id="day-planner-generating"
                className="flex-1 min-h-[350px] border border-[#C5E384] rounded-lg flex flex-col items-center justify-center p-8 bg-[#FFF9EB] shadow-sm animate-pulse"
              >
                <div className="text-center space-y-3">
                  <Sparkles size={24} className="mx-auto animate-spin text-[#200F07]" />
                  <p className="text-xs font-space uppercase tracking-wider text-[#200F07] font-semibold">
                    Generating your day plan...
                  </p>
                  <p className="text-[11px] text-[#200F07]/70 max-w-xs font-dm">
                    Gemini is structuring your tasks and breaks to fit your schedule.
                  </p>
                </div>
              </div>
            ) : !plannerOutput ? (
              !showPlannerForm ? (
                /* Step 0 - Intro/Start Plan */
                <div
                  id="day-planner-start-card"
                  className="border border-[#C5E384] rounded-lg p-6 bg-[#FFF9EB] space-y-5 flex flex-col justify-center items-center text-center min-h-[300px] shadow-sm"
                >
                  <div className="space-y-2.5 max-w-sm">
                    <div className="p-3 bg-[#C5E384]/20 rounded-full w-12 h-12 flex items-center justify-center mx-auto border border-[#C5E384]">
                      <Sparkles size={20} className="text-[#200F07]" />
                    </div>
                    <h3 className="text-sm font-space uppercase tracking-wider font-bold text-[#200F07] pt-1">
                      Gemini Day Planner
                    </h3>
                    <p className="text-xs text-[#200F07]/85 leading-relaxed font-dm">
                      Plan your day with Gemini AI. Automatically fetch your Google Calendar commitments and design a realistic, balanced hour-by-hour schedule.
                    </p>
                  </div>

                  <button
                    id="button-start-planning"
                    type="button"
                    onClick={handleStartPlanning}
                    disabled={isFetchingCalendarForForm}
                    className="w-full py-2.5 px-4 bg-[#200F07] hover:bg-[#200F07]/90 disabled:opacity-50 text-[#C5E384] rounded text-xs font-space font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 border-0"
                  >
                    {isFetchingCalendarForForm ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Checking Calendar...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Generate My Day Plan</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Step 1 - Context Form */
                <form
                  id="form-day-planner-context"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleGeneratePlan();
                  }}
                  className="border border-[#C5E384] rounded-lg p-6 bg-[#FFF9EB] space-y-4 flex flex-col justify-between shadow-sm"
                >
                  <div className="space-y-4">
                    {/* Start time */}
                    <div>
                      <label htmlFor="input-day-start" className="block text-xs font-dm uppercase tracking-wider text-[#200F07]/70 mb-1 font-bold">
                        What time does your day start?
                      </label>
                      <input
                        id="input-day-start"
                        type="time"
                        required
                        value={dayStart}
                        onChange={(e) => setDayStart(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm font-semibold"
                      />
                    </div>

                    {/* End time */}
                    <div>
                      <label htmlFor="input-day-end" className="block text-xs font-dm uppercase tracking-wider text-[#200F07]/70 mb-1 font-bold">
                        What time do you want to wrap up?
                      </label>
                      <input
                        id="input-day-end"
                        type="time"
                        required
                        value={dayEnd}
                        onChange={(e) => setDayEnd(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm font-semibold"
                      />
                    </div>

                    {/* Fixed events */}
                    <div>
                      <label htmlFor="input-fixed-events" className="block text-xs font-dm uppercase tracking-wider text-[#200F07]/70 mb-1 font-bold">
                        Any fixed events today?
                      </label>
                      <textarea
                        id="input-fixed-events"
                        rows={2}
                        value={fixedEvents}
                        onChange={(e) => setFixedEvents(e.target.value)}
                        placeholder="e.g. lunch at 1pm, gym at 6pm, team call at 3pm"
                        className="w-full px-3 py-2 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] placeholder:text-[#200F07]/40 focus:outline-none focus:border-[#200F07] font-dm font-semibold resize-none"
                      />
                      {isAutoFilledFromCalendar && (
                        <p id="note-autofilled-calendar" className="mt-1.5 text-[11px] font-dm text-[#200F07]/80 flex items-center gap-1 font-bold">
                          <span>📅 Auto-filled from your Google Calendar</span>
                        </p>
                      )}
                    </div>
                    
                    {/* Include Habits & Goals Checkbox */}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="checkbox-include-habits"
                        checked={includeHabitsInPlan}
                        onChange={(e) => setIncludeHabitsInPlan(e.target.checked)}
                        className="w-4 h-4 text-[#200F07] border-[#C5E384] rounded focus:ring-[#200F07] cursor-pointer"
                      />
                      <label htmlFor="checkbox-include-habits" className="text-sm font-dm text-[#200F07] cursor-pointer font-bold">
                        Include Habits & Goals in my plan
                      </label>
                    </div>

                    {/* Work style */}
                    <div>
                      <label htmlFor="select-work-style" className="block text-xs font-dm uppercase tracking-wider text-[#200F07]/70 mb-1 font-bold">
                        How do you prefer to work?
                      </label>
                      <select
                        id="select-work-style"
                        value={workStyle}
                        onChange={(e) => setWorkStyle(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm font-semibold"
                      >
                        <option value="Deep focus blocks (90 min)">Deep focus blocks (90 min)</option>
                        <option value="Balanced (45 min work + breaks)">Balanced (45 min work + breaks)</option>
                        <option value="Short bursts (25 min pomodoro style)">Short bursts (25 min pomodoro style)</option>
                      </select>
                    </div>
                  </div>

                  {planError && (
                    <div className="text-xs font-dm text-red-600 bg-red-50 border border-red-200 p-2.5 rounded text-center">
                      {planError}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      id="button-generate-plan"
                      type="submit"
                      className="w-full py-2.5 px-4 bg-[#200F07] text-[#C5E384] rounded text-sm font-space uppercase tracking-wider hover:bg-[#200F07]/90 font-bold transition-colors cursor-pointer border-0"
                    >
                      Generate My Day Plan
                    </button>
                  </div>
                </form>
              )
            ) : (
              /* Step 3 - Display Plan */
              <div 
                id="display-day-plan"
                className="border border-[#C5E384] rounded-lg p-5 bg-[#FFF9EB] flex flex-col justify-between shadow-sm"
              >
                <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                  {parsePlan(plannerOutput).map((item) => {
                    if (item.type === "warning") {
                      return (
                        <div 
                          key={item.id} 
                          id={item.id}
                          className="p-3 bg-red-50/50 border border-red-100 rounded text-red-600 text-xs font-dm leading-relaxed flex items-start gap-2"
                        >
                          <span className="shrink-0 font-bold">⚠️</span>
                          <div>
                            {item.timeRange ? (
                              <span><strong>{item.timeRange}</strong> | {item.activity} {item.note && `- ${item.note}`}</span>
                            ) : (
                              <span>{item.rawText}</span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (item.type === "break_meal") {
                      return (
                        <div 
                          key={item.id} 
                          id={item.id}
                          className="flex items-start gap-3 py-2.5 border-b border-[#C5E384]/30 text-[#200F07]/60 font-dm text-xs"
                        >
                          <div className="w-20 shrink-0 font-space text-[11px] font-bold tracking-tight text-[#200F07]/60">{item.timeRange}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[#200F07]/70">{item.activity}</div>
                            {item.note && <div className="text-[11px] text-[#200F07]/50 mt-0.5 leading-relaxed">{item.note}</div>}
                          </div>
                        </div>
                      );
                    }

                    if (item.type === "task") {
                      return (
                        <div 
                          key={item.id} 
                          id={item.id}
                          className="flex items-start gap-3 py-2.5 border-b border-[#C5E384]/30 text-[#200F07] font-dm text-xs"
                        >
                          <div className="w-20 shrink-0 font-space text-[11px] font-bold text-[#200F07] tracking-tight">{item.timeRange}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[#200F07]">{item.activity}</div>
                            {item.note && <div className="text-[11px] text-[#200F07]/85 mt-0.5 leading-relaxed">{item.note}</div>}
                          </div>
                        </div>
                      );
                    }

                    // type === "other"
                    return (
                      <div 
                        key={item.id} 
                        id={item.id}
                        className="py-2 px-3 text-[#200F07]/70 font-dm text-xs italic border-l-2 border-[#200F07] bg-[#C5E384]/15 rounded-r my-1 leading-relaxed"
                      >
                        {item.rawText}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-[#C5E384]/30 mt-4 flex flex-col gap-2">
                  <div className="text-[10px] font-space text-[#200F07]/50 text-center uppercase tracking-wider mb-2 font-bold">
                    Powered by Gemini AI
                  </div>
                  {user && plannerOutput && (
                    <>
                      <button
                        id="button-export-plan-to-calendar"
                        type="button"
                        onClick={handleExportPlanToCalendar}
                        disabled={isExportingCalendar}
                        className="w-full py-2.5 px-4 bg-[#200F07] text-[#C5E384] hover:bg-[#200F07]/90 disabled:opacity-50 rounded text-xs font-space uppercase tracking-wider font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-2 mb-1 border-0"
                      >
                        <Calendar size={13} />
                        {isExportingCalendar ? "Exporting to Calendar..." : "Export Plan to Google Calendar"}
                      </button>
                      {exportSuccess && (
                        <div id="export-success-msg" className="text-[11px] font-dm text-emerald-700 bg-emerald-50 border border-emerald-100 p-2.5 rounded text-center my-1 leading-relaxed font-semibold">
                          {exportSuccess}
                        </div>
                      )}
                      {exportError && (
                        <div id="export-error-msg" className="text-[11px] font-dm text-red-600 bg-red-50 border border-red-100 p-2.5 rounded text-center my-1 leading-relaxed">
                          {exportError}
                        </div>
                      )}
                    </>
                  )}
                  <button
                    id="button-reset-day-plan"
                    type="button"
                    onClick={() => {
                      setPlannerOutput(null);
                      setExportSuccess(null);
                      setExportError(null);
                      setShowPlannerForm(false);
                      setIsAutoFilledFromCalendar(false);
                      try {
                        localStorage.removeItem("clutch_day_plan");
                      } catch {}
                    }}
                    className="w-full py-2 px-4 border border-[#C5E384] hover:border-[#200F07] rounded text-xs font-space uppercase tracking-wider text-[#200F07]/70 hover:text-[#200F07] bg-[#FFF9EB] font-bold transition-colors cursor-pointer text-center"
                  >
                    Create New Plan
                  </button>
                </div>
              </div>
            )}
          </section>
            </div>
          ) : activeTab === "habits" ? (
            <div id="section-habits-goals" className="col-span-1 lg:col-span-3 space-y-8">
              
              {/* Greeting Banner */}
              {(() => {
                const hour = time.getHours();
                let greeting = `Good Morning, ${userName}`;
                if (hour >= 12 && hour < 17) greeting = `Good Afternoon, ${userName}`;
                else if (hour >= 17) greeting = `Good Evening, ${userName}`;

                const todayStr = new Date().toISOString().split('T')[0];
                let subtext = "";
                let highestStreak = 0;
                
                if (habits.length === 0) {
                  subtext = "Ready to build your first habit?";
                } else {
                  const completedCount = habits.filter(h => h.history.includes(todayStr)).length;
                  if (completedCount === 0) {
                    subtext = "Ready to check in?";
                  } else if (completedCount < habits.length) {
                    subtext = "Keep the momentum going!";
                  } else {
                    subtext = "You've crushed all habits today!";
                  }
                  
                  const streaks = habits.map(h => calculateStreakForHabit(h.history, todayStr));
                  highestStreak = Math.max(0, ...streaks);
                }

                return (
                  <div>
                    <div className="flex justify-between items-center py-2 mb-10">
                      <div>
                        <h2 className="text-[32px] font-bold tracking-tight text-[#200F07] font-space leading-none">{greeting}</h2>
                        <p key={subtext} className="text-[14px] text-[#200F07]/80 mt-3 font-dm animate-fade-in-subtext">{subtext}</p>
                      </div>
                      <div className="flex items-center gap-1.5 bg-[#FFF9EB] px-2.5 py-1 rounded-full border border-[#C5E384]">
                        <span className="text-sm">🔥</span>
                        <span className="text-xs font-bold text-[#200F07] font-dm">{highestStreak}</span>
                      </div>
                    </div>
                    <div className="w-full h-px bg-[#C5E384]/35"></div>
                  </div>
                );
              })()}

              {/* Header and Add Habit Button row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-[18px] font-bold tracking-tight text-[#200F07] font-space">Habits & Goals</h2>
                  <p className="text-[11px] text-[#200F07]/70 font-dm uppercase tracking-[0.1em] mt-1.5">Track routines & streaks</p>
                </div>
                
                {/* Expandable Add Habit Form Trigger */}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsAddHabitExpanded(!isAddHabitExpanded)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FFF9EB] hover:bg-[#C5E384] border-[1.5px] border-[#200F07] rounded text-xs font-space font-semibold text-[#200F07] transition-all cursor-pointer"
                  >
                    <Plus className={`w-3.5 h-3.5 transition-transform duration-200 ${isAddHabitExpanded ? "rotate-45" : ""}`} />
                    {isAddHabitExpanded ? "Close Panel" : "Add Habit"}
                  </button>
                </div>
              </div>

              {/* Gemini Nudge Banner */}
              {(geminiNudge || isLoadingNudge) && (
                <div className="bg-[#FFF9EB] border border-[#C5E384] rounded-xl p-4 flex gap-3 items-start w-full shadow-sm">
                  <Sparkles className="w-4 h-4 text-[#200F07] shrink-0 mt-0.5 animate-pulse" />
                  <div className="space-y-1">
                    <span className="text-[10px] font-dm uppercase tracking-wider text-[#200F07]/60">Gemini Nudge</span>
                    {isLoadingNudge ? (
                      <div className="flex items-center gap-2 text-xs text-[#200F07]/60 font-dm mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#200F07] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#200F07] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#200F07] animate-bounce" style={{ animationDelay: "300ms" }} />
                        <span className="font-dm text-[10px]">Asking Gemini for encouragement...</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[#200F07]/90 font-dm italic leading-relaxed">
                        "{geminiNudge}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Add Habit Form Panel */}
              {isAddHabitExpanded && (
                <div className="bg-[#FFF9EB] border border-[#C5E384] rounded-xl p-5 space-y-4 shadow-sm w-full">
                  <div className="flex justify-between items-center pb-2 border-b border-[#C5E384]/30">
                    <h4 className="text-xs font-dm uppercase tracking-wider text-[#200F07]/60 font-semibold">New Habit details</h4>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-dm text-[#200F07] uppercase font-bold tracking-wider mb-1">
                        Habit Name
                      </label>
                      <input
                        type="text"
                        value={newHabitName}
                        onChange={(e) => setNewHabitName(e.target.value)}
                        placeholder="e.g. 15-Min Meditation, Stretch, Read, Gym..."
                        className="w-full p-2.5 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#1a1a1a] placeholder:text-neutral-400 focus:outline-none focus:border-[#200F07] font-dm"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-dm text-[#200F07] uppercase font-bold tracking-wider mb-1">
                          Frequency
                        </label>
                        <select
                          value={newHabitFrequency}
                          onChange={(e) => setNewHabitFrequency(e.target.value as "Daily" | "Weekly")}
                          className="w-full p-2.5 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                        >
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] font-dm text-[#200F07] uppercase font-bold tracking-wider mb-1">
                          Target Duration
                        </label>
                        <input
                          type="text"
                          value={newHabitDuration}
                          onChange={(e) => setNewHabitDuration(e.target.value)}
                          placeholder="e.g. 30 mins, 1 hour"
                          className="w-full p-2.5 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-dm text-[#200F07] uppercase font-bold tracking-wider mb-1">
                          Goal Duration (Days)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={newHabitGoalDuration}
                          onChange={(e) => setNewHabitGoalDuration(e.target.value)}
                          placeholder="e.g. 30"
                          className="w-full p-2.5 bg-[#FFF9EB] border border-[#C5E384] rounded text-sm text-[#200F07] focus:outline-none focus:border-[#200F07] font-dm"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddHabitExpanded(false);
                        setNewHabitName("");
                        setNewHabitDuration("");
                        setNewHabitGoalDuration("30");
                      }}
                      className="px-4 py-2 border border-[#C5E384] hover:bg-[#C5E384]/20 rounded text-xs font-space font-semibold uppercase tracking-wider text-[#200F07] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newHabitName.trim()) return;
                        const parsedGoal = parseInt(newHabitGoalDuration, 10);
                        const newHabit: Habit = {
                          id: "habit_" + Date.now(),
                          name: newHabitName.trim(),
                          frequency: newHabitFrequency,
                          targetDuration: newHabitDuration.trim() || undefined,
                          goalDuration: isNaN(parsedGoal) || parsedGoal <= 0 ? 30 : parsedGoal,
                          createdAt: new Date().toISOString(),
                          history: []
                        };
                        setHabits(prev => [...prev, newHabit]);
                        setNewHabitName("");
                        setNewHabitDuration("");
                        setNewHabitGoalDuration("30");
                        setIsAddHabitExpanded(false);
                      }}
                      disabled={!newHabitName.trim()}
                      className="px-4 py-2 bg-[#200F07] hover:bg-[#200F07]/90 disabled:opacity-50 disabled:cursor-not-allowed text-[#C5E384] text-xs font-space font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
                    >
                      Save Habit
                    </button>
                  </div>
                </div>
              )}

              {/* Week Strip Navigation */}
              <div className="space-y-3">
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] font-dm uppercase tracking-wider text-[#200F07]/60">Weekly Calendar</span>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      setSelectedDate(`${yyyy}-${mm}-${dd}`);
                    }}
                    className="text-[10px] font-dm uppercase tracking-wider text-[#200F07] hover:text-[#200F07]/80 transition-colors cursor-pointer underline font-medium"
                  >
                    Go To Today
                  </button>
                </div>
                
                <div className="flex justify-between items-center bg-[#FFF9EB] rounded-xl p-4 border border-[#C5E384] shadow-sm w-full gap-1 overflow-x-auto">
                  {getCurrentWeekDays(new Date()).map((day) => {
                    const isSelected = selectedDate === day.dateStr;
                    return (
                      <button
                        key={day.dateStr}
                        type="button"
                        onClick={() => setSelectedDate(day.dateStr)}
                        className={`flex flex-col items-center p-3 rounded-lg transition-all min-w-[55px] cursor-pointer relative ${
                          isSelected 
                            ? "bg-[#200F07] text-[#FFF9EB]" 
                            : "hover:bg-[#C5E384]/20 text-[#200F07]"
                        }`}
                      >
                        <span className={`text-[9px] uppercase font-dm tracking-wider font-semibold ${isSelected ? "text-[#C5E384]" : "text-[#200F07]/60"}`}>
                          {day.dayName}
                        </span>
                        <span className={`text-xs font-bold mt-1.5 w-7 h-7 flex items-center justify-center rounded-full font-space ${
                          day.isToday 
                            ? isSelected 
                              ? "bg-[#FFF9EB] text-[#200F07]" 
                              : "bg-[#200F07] text-[#FFF9EB]" 
                            : ""
                        }`}>
                          {day.dayNumber}
                        </span>
                        {habits.some(h => h.history.includes(day.dateStr)) && (
                          <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? "bg-[#C5E384]" : "bg-[#200F07]"}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-center text-[10px] text-[#200F07]/60 font-dm uppercase tracking-wider pt-1 font-medium">
                  Viewing habits for: {selectedDate} {selectedDate === new Date().toISOString().split("T")[0] && "(Today)"}
                </p>
              </div>

              {/* Habit Cards List */}
              <div className="space-y-3 w-full">
                {habits.length === 0 ? (
                  <div className="text-center p-16 bg-[#FFF9EB] border border-dashed border-[#C5E384] rounded-xl">
                    <p className="text-sm text-[#200F07]/60 font-dm font-semibold">No habits tracked yet.</p>
                    <button
                      type="button"
                      onClick={() => setIsAddHabitExpanded(true)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-space uppercase tracking-wider text-[#200F07] underline hover:no-underline cursor-pointer font-bold"
                    >
                      Create your first habit
                    </button>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={habits.map(h => h.id)} strategy={verticalListSortingStrategy}>
                      {habits.map((habit) => {
                        const isCompletedOnSelectedDate = habit.history.includes(selectedDate);
                    const todayStr = new Date().toISOString().split("T")[0];
                    const streak = calculateStreakForHabit(habit.history, todayStr);
                    const isSelectedToday = selectedDate === todayStr;
                    
                    const handleToggleComplete = () => {
                      const exists = habit.history.includes(selectedDate);
                      if (!exists && isSelectedToday) {
                        setRecentlyCompletedHabitId(habit.id);
                        setTimeout(() => setRecentlyCompletedHabitId(null), 1000);
                        
                        const oldStreak = streak;
                        const newHistory = [...habit.history, selectedDate];
                        const newStreak = calculateStreakForHabit(newHistory, todayStr);
                        if (newStreak > oldStreak) {
                          setRecentStreakIncreaseHabitId(habit.id);
                          setTimeout(() => setRecentStreakIncreaseHabitId(null), 1000);
                        }
                      }

                      setHabits(prev => prev.map(h => {
                        if (h.id === habit.id) {
                          return {
                            ...h,
                            history: exists 
                              ? h.history.filter(d => d !== selectedDate)
                              : [...h.history, selectedDate]
                          };
                        }
                        return h;
                      }));
                    };

                    const isExpanded = expandedHabitId === habit.id;

                    return (
                      <SortableHabitWrapper key={habit.id} id={habit.id}>
                        {({ attributes, listeners }) => (
                          <div
                            onClick={() => {
                          if (isExpanded) {
                            setExpandedHabitId(null);
                          } else {
                            setExpandedHabitId(habit.id);
                            setEditingHabitName(habit.name);
                            setEditingHabitDuration(habit.targetDuration || "");
                            setEditingHabitGoalDuration(habit.goalDuration?.toString() || "30");
                            setEditingHabitFrequency(habit.frequency);
                          }
                        }}
                        className={`bg-[#FFF9EB] border relative ${
                          isExpanded ? "border-[#200F07] shadow-sm" : "border-[#C5E384] hover:border-[#200F07]"
                        } rounded-xl transition-all overflow-hidden cursor-pointer ${
                          recentlyCompletedHabitId === habit.id ? "animate-pulse-card" : ""
                        }`}
                      >
                        {/* Card Header Row (Interactive Area) */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4">
                          <div className="flex items-start sm:items-center gap-3">
                            <div 
                              {...attributes} 
                              {...listeners} 
                              className="p-1 cursor-grab text-[#200F07]/50 hover:text-[#200F07] flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="w-5 h-5" />
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-[#200F07] font-space">{habit.name}</h4>
                              <div className="flex gap-1">
                                <span className="text-[9px] px-2 py-0.5 bg-[#C5E384]/30 text-[#200F07] rounded font-dm uppercase tracking-wider font-semibold">
                                  {habit.frequency}
                                </span>
                                {habit.targetDuration && (
                                  <span className="text-[9px] px-2 py-0.5 bg-[#C5E384]/20 text-[#200F07] rounded font-dm uppercase tracking-wider flex items-center gap-1 font-semibold">
                                    <Clock className="w-2.5 h-2.5" />
                                    {habit.targetDuration}
                                  </span>
                                )}
                                {habit.goalDuration && (
                                  <span className="text-[9px] px-2 py-0.5 bg-[#C5E384]/20 text-[#200F07] rounded font-dm uppercase tracking-wider font-semibold">
                                    Goal: {habit.goalDuration} Days
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center flex-wrap gap-2 text-[13px] text-[#200F07]/70 font-dm">
                              <span className={`flex items-center gap-1 whitespace-nowrap ${recentStreakIncreaseHabitId === habit.id ? "animate-bounce-streak" : ""}`}>
                                <span>🔥</span>
                                <span className="font-semibold">{streak === 0 ? "No streak yet" : `${streak} day streak`}</span>
                              </span>
                              <span className="text-[#C5E384] font-bold">•</span>
                              <span className="whitespace-nowrap">
                                {habit.history.length} completions total
                              </span>
                            </div>
                          </div>
                          </div>
                          
                          <div className="flex items-center justify-between sm:justify-end gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleComplete();
                              }}
                              className={`relative overflow-visible flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-space uppercase tracking-wider font-bold transition-all cursor-pointer ${
                                isCompletedOnSelectedDate
                                  ? "bg-[#C5E384]/30 text-[#200F07] border border-[#C5E384]"
                                  : "bg-[#200F07] hover:bg-[#200F07]/90 text-[#FFF9EB] border border-[#200F07] hover:scale-[1.01] active:scale-[0.99]"
                              }`}
                            >
                              {recentlyCompletedHabitId === habit.id && (
                                <>
                                  <div className="particle" style={{ '--tx': '-30px', '--ty': '-30px', backgroundColor: '#C5E384' } as React.CSSProperties}></div>
                                  <div className="particle" style={{ '--tx': '30px', '--ty': '-20px', backgroundColor: '#200F07' } as React.CSSProperties}></div>
                                  <div className="particle" style={{ '--tx': '0px', '--ty': '-40px', backgroundColor: '#FFF9EB' } as React.CSSProperties}></div>
                                  <div className="particle" style={{ '--tx': '-20px', '--ty': '20px', backgroundColor: '#C5E384' } as React.CSSProperties}></div>
                                  <div className="particle" style={{ '--tx': '25px', '--ty': '15px', backgroundColor: '#200F07' } as React.CSSProperties}></div>
                                </>
                              )}
                              {isCompletedOnSelectedDate ? (
                                <>
                                  <Check className="w-3 h-3 text-[#200F07] stroke-[3]" />
                                  Completed ✓
                                </>
                              ) : isSelectedToday ? (
                                "Done Today"
                              ) : (
                                "Mark Completed"
                              )}
                            </button>
                            
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHabits(prev => prev.filter(h => h.id !== habit.id));
                                }}
                                className="p-2 text-neutral-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                                title="Delete habit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
 
                              <div className="p-1 text-[#200F07]/50 hover:text-[#200F07] transition-colors">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
 
                        {/* Expanded Progress Grid Section */}
                        {isExpanded && (
                          <div 
                            className="border-t border-[#C5E384]/30 bg-[#C5E384]/10 p-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-col md:flex-row gap-4 mb-4">
                              {/* Left Column (60%) */}
                              <div className="w-full md:w-[60%] bg-[#FFF9EB] p-3 rounded border border-[#C5E384]">
                                <h5 className="text-[10px] font-bold text-[#200F07] uppercase tracking-wider font-space mb-2">Edit Habit</h5>
                                <div className="space-y-2">
                                  {/* Name Input */}
                                  <div>
                                    <input 
                                      type="text" 
                                      value={editingHabitName}
                                      onChange={(e) => setEditingHabitName(e.target.value)}
                                      className="w-full px-2 py-1 bg-[#FFF9EB] border border-[#C5E384] text-[#200F07] rounded text-xs focus:border-[#200F07] focus:outline-none font-dm font-semibold"
                                      placeholder="Habit Name"
                                    />
                                  </div>
                                  {/* Frequency & Duration row */}
                                  <div className="flex gap-2">
                                    <select
                                      value={editingHabitFrequency}
                                      onChange={(e) => setEditingHabitFrequency(e.target.value as "Daily" | "Weekly")}
                                      className="w-1/2 px-2 py-1 bg-[#FFF9EB] border border-[#C5E384] text-[#200F07] rounded text-xs focus:border-[#200F07] focus:outline-none font-dm font-semibold"
                                    >
                                      <option value="Daily">Daily</option>
                                      <option value="Weekly">Weekly</option>
                                    </select>
                                    <input 
                                      type="text" 
                                      value={editingHabitDuration}
                                      onChange={(e) => setEditingHabitDuration(e.target.value)}
                                      className="w-1/2 px-2 py-1 bg-[#FFF9EB] border border-[#C5E384] text-[#200F07] rounded text-xs focus:border-[#200F07] focus:outline-none font-dm font-semibold"
                                      placeholder="Duration (e.g. 15m)"
                                    />
                                  </div>
                                  {/* Goal row */}
                                  <div className="flex gap-2 items-center">
                                    <label className="text-[10px] font-dm text-[#200F07]/70 uppercase tracking-wider shrink-0 font-semibold">Goal (Days)</label>
                                    <input 
                                      type="number" 
                                      min="1"
                                      max="365"
                                      value={editingHabitGoalDuration}
                                      onChange={(e) => setEditingHabitGoalDuration(e.target.value)}
                                      className="w-16 px-2 py-1 bg-[#FFF9EB] border border-[#C5E384] text-[#200F07] rounded text-xs focus:border-[#200F07] focus:outline-none font-dm font-semibold"
                                    />
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-[#C5E384]/30">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedHabitId(null)}
                                    className="px-2 py-1 text-[10px] text-[#200F07] hover:bg-[#C5E384]/25 rounded transition-colors font-space font-semibold uppercase tracking-wider"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!editingHabitName.trim()) return;
                                      const parsedGoal = parseInt(editingHabitGoalDuration, 10);
                                      setHabits(prev => prev.map(h => 
                                        h.id === habit.id ? {
                                          ...h,
                                          name: editingHabitName.trim(),
                                          frequency: editingHabitFrequency,
                                          targetDuration: editingHabitDuration.trim() || undefined,
                                          goalDuration: isNaN(parsedGoal) || parsedGoal <= 0 ? 30 : parsedGoal
                                        } : h
                                      ));
                                      setExpandedHabitId(null);
                                    }}
                                    className="px-2 py-1 text-[10px] bg-[#200F07] text-[#C5E384] hover:bg-[#200F07]/90 rounded transition-colors font-space font-bold uppercase tracking-wider disabled:opacity-50"
                                    disabled={!editingHabitName.trim()}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>

                              {/* Right Column (40%) */}
                              <div className="w-full md:w-[40%] bg-[#FFF9EB] p-3 rounded border border-[#C5E384] flex flex-col items-center justify-center text-center">
                                <div className="text-3xl font-bold mb-1 text-[#200F07] font-space">🔥 {streak}</div>
                                <div className="text-[10px] font-dm uppercase tracking-wider text-[#200F07]/60 mb-2 font-semibold">
                                  day streak
                                </div>
                                <div className="text-[10px] font-dm text-[#200F07]/80 bg-[#C5E384]/20 px-2 py-1 rounded-full border border-[#C5E384] font-semibold">
                                  {habit.history.length} total completions
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-dm uppercase tracking-wider text-[#200F07]/60">
                                  {habit.goalDuration || 30}-Day Progress Map
                                </span>
                                <span className="text-[9px] font-dm text-[#200F07]/60">
                                  Click any past/today circle to toggle completion
                                </span>
                              </div>

                              {(() => {
                                const goalDays = getHabitGoalDays(habit, todayStr);
                                const totalGoalDays = habit.goalDuration || 30;
                                const completedInGoal = goalDays.filter(d => d.isCompleted).length;
                                const pct = Math.round((completedInGoal / totalGoalDays) * 100);

                                return (
                                  <div className="space-y-4">
                                    {/* Grid Layout (7 cols like a calendar) */}
                                    <div className="grid grid-cols-7 gap-1.5 max-w-sm sm:max-w-md">
                                      {goalDays.map((day) => {
                                        let buttonStyle = "";
                                        let element = null;

                                        if (day.isCompleted) {
                                          buttonStyle = "bg-[#200F07] text-[#FFF9EB] border-[#200F07]";
                                          element = <Check className="w-3 h-3 text-[#FFF9EB] stroke-[3.5]" />;
                                        } else if (day.isToday) {
                                          buttonStyle = "bg-[#FFF9EB] text-[#200F07] border-2 border-[#200F07] font-bold font-dm shadow-xs";
                                          element = <span className="text-[10px] font-dm">{day.dayNumber}</span>;
                                        } else if (day.isFuture) {
                                          buttonStyle = "bg-[#FFF9EB]/40 text-[#200F07]/30 border border-[#C5E384] cursor-not-allowed opacity-40";
                                          element = <span className="text-[10px] font-dm">{day.dayNumber}</span>;
                                        } else {
                                          buttonStyle = "bg-[#C5E384]/20 text-[#200F07] border border-[#C5E384] hover:border-[#200F07]";
                                          element = <span className="text-[9px] font-bold text-[#200F07]/40">✕</span>;
                                        }

                                        const handleCircleClick = () => {
                                          if (day.isFuture) return;

                                          setHabits(prev => prev.map(h => {
                                            if (h.id === habit.id) {
                                              const exists = h.history.includes(day.dateStr);
                                              return {
                                                ...h,
                                                history: exists
                                                  ? h.history.filter(d => d !== day.dateStr)
                                                  : [...h.history, day.dateStr]
                                              };
                                            }
                                            return h;
                                          }));
                                        };

                                        return (
                                          <button
                                            key={day.dayNumber}
                                            type="button"
                                            disabled={day.isFuture}
                                            onClick={handleCircleClick}
                                            title={`${day.dateStr}${day.isCompleted ? " (Completed)" : ""}${day.isToday ? " (Today)" : ""}`}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all ${buttonStyle} ${
                                              !day.isFuture ? "cursor-pointer hover:scale-[1.05]" : ""
                                            }`}
                                          >
                                            {element}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    {/* Stats block */}
                                    <div className="pt-3 border-t border-[#C5E384]/30 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#200F07]/70 font-dm">
                                      <span className="text-[#200F07] font-bold">
                                        {completedInGoal}/{totalGoalDays} days completed
                                      </span>
                                      <span className="text-[#C5E384] font-bold">•</span>
                                      <span className="text-[#200F07] font-bold">
                                        {pct}%
                                      </span>
                                      <span className="text-[#C5E384] font-bold">•</span>
                                      <span className="flex items-center gap-1 text-[#200F07] font-bold">
                                        <Flame className="w-3.5 h-3.5 text-[#200F07]" />
                                        {streak} day streak
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </SortableHabitWrapper>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
          ) : activeTab === "focus_room" ? (
            <div id="section-focus-room" className="col-span-1 lg:col-span-3 space-y-10 relative flex flex-col justify-between pb-32 animate-welcome-label-input min-h-[500px]">
              <style>{`
                @keyframes spinRecord {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                .spinning-record {
                  animation: spinRecord 4s linear infinite;
                }
                @keyframes slow-float-1 {
                  0% { transform: translate(0, 0) scale(1); }
                  50% { transform: translate(40px, -30px) scale(1.1); }
                  100% { transform: translate(-20px, 20px) scale(0.9); }
                }
                @keyframes slow-float-2 {
                  0% { transform: translate(0, 0) scale(1); }
                  50% { transform: translate(-50px, 40px) scale(0.9); }
                  100% { transform: translate(30px, -20px) scale(1.15); }
                }
                @keyframes slow-float-3 {
                  0% { transform: translate(0, 0) scale(1.1); }
                  50% { transform: translate(30px, 50px) scale(0.85); }
                  100% { transform: translate(-40px, -30px) scale(1.05); }
                }
                @keyframes slow-float-4 {
                  0% { transform: translate(0, 0) scale(0.9); }
                  50% { transform: translate(-30px, -40px) scale(1.1); }
                  100% { transform: translate(40px, 30px) scale(0.95); }
                }
                @keyframes slow-float-5 {
                  0% { transform: translate(0, 0) scale(1); }
                  50% { transform: translate(50px, 20px) scale(1.1); }
                  100% { transform: translate(-30px, -50px) scale(0.9); }
                }
                @keyframes slow-float-6 {
                  0% { transform: translate(0, 0) scale(1.05); }
                  50% { transform: translate(-40px, -30px) scale(0.9); }
                  100% { transform: translate(20px, 40px) scale(1.1); }
                }
                @keyframes slow-float-7 {
                  0% { transform: translate(0, 0) scale(0.95); }
                  50% { transform: translate(30px, -40px) scale(1.15); }
                  100% { transform: translate(-50px, 20px) scale(0.85); }
                }
                @keyframes slow-float-8 {
                  0% { transform: translate(0, 0) scale(1.1); }
                  50% { transform: translate(-20px, 50px) scale(0.95); }
                  100% { transform: translate(40px, -30px) scale(1.05); }
                }
                .float-orb-1 { animation: slow-float-1 12s infinite alternate ease-in-out; }
                .float-orb-2 { animation: slow-float-2 15s infinite alternate ease-in-out; }
                .float-orb-3 { animation: slow-float-3 10s infinite alternate ease-in-out; }
                .float-orb-4 { animation: slow-float-4 13s infinite alternate ease-in-out; }
                .float-orb-5 { animation: slow-float-5 11s infinite alternate ease-in-out; }
                .float-orb-6 { animation: slow-float-6 14s infinite alternate ease-in-out; }
                .float-orb-7 { animation: slow-float-7 9s infinite alternate ease-in-out; }
                .float-orb-8 { animation: slow-float-8 16s infinite alternate ease-in-out; }

                @keyframes rain {
                  0% { transform: translateY(-120%); }
                  100% { transform: translateY(110vh); }
                }
                @keyframes leaf-fall {
                  0% { transform: translate(0, -10%) rotate(0deg); opacity: 0; }
                  15% { opacity: 0.7; }
                  85% { opacity: 0.7; }
                  100% { transform: translate(-100px, 110vh) rotate(360deg); opacity: 0; }
                }
                @keyframes firefly-glow {
                  0%, 100% { opacity: 0.2; transform: translateY(0) scale(1); }
                  50% { opacity: 0.95; transform: translateY(-30px) scale(1.3); }
                }
                @keyframes fog-drift {
                  0% { transform: translateX(-100%); opacity: 0; }
                  10% { opacity: 0.25; }
                  90% { opacity: 0.25; }
                  100% { transform: translateX(100vw); opacity: 0; }
                }
              `}</style>

              {/* FOREST NIGHT ANIMATED BACKGROUND */}
              {isLockingIn && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[32px] z-0">
                  {/* Floating Orbs */}
                  <div className="absolute w-[300px] h-[300px] rounded-full bg-[rgba(93,115,0,0.15)] filter blur-[60px] float-orb-1 -top-[10%] -left-[10%]" />
                  <div className="absolute w-[250px] h-[250px] rounded-full bg-[rgba(197,227,132,0.08)] filter blur-[50px] float-orb-2 -bottom-[5%] -right-[5%]" />
                  <div className="absolute w-[350px] h-[350px] rounded-full bg-[rgba(93,115,0,0.15)] filter blur-[80px] float-orb-3 top-[30%] left-[50%]" />
                  <div className="absolute w-[200px] h-[200px] rounded-full bg-[rgba(197,227,132,0.08)] filter blur-[40px] float-orb-4 bottom-[20%] left-[10%]" />
                  <div className="absolute w-[280px] h-[280px] rounded-full bg-[rgba(93,115,0,0.15)] filter blur-[70px] float-orb-5 top-[15%] right-[15%]" />
                  <div className="absolute w-[220px] h-[220px] rounded-full bg-[rgba(197,227,132,0.08)] filter blur-[45px] float-orb-6 bottom-[40%] right-[30%]" />
                  <div className="absolute w-[180px] h-[180px] rounded-full bg-[rgba(93,115,0,0.15)] filter blur-[50px] float-orb-7 top-[60%] left-[20%]" />
                  <div className="absolute w-[320px] h-[320px] rounded-full bg-[rgba(197,227,132,0.08)] filter blur-[75px] float-orb-8 -top-[5%] left-[40%]" />
                  
                  {/* Semi transparent dark overlay */}
                  <div className="absolute inset-0 bg-[#0d1f0f]/40" />
                </div>
              )}

              {/* SECTION 1 - Header (Only visible in Phase 1 Selection Screen) */}
              {!isLockingIn && !lockInCompleted && (
                <div className="text-center pb-6 border-b border-[#200F07]/10 w-full z-10">
                  <h2 className="text-[32px] font-bold tracking-[0.2em] text-[#200F07] font-space uppercase">LOCK IN</h2>
                  <p className="text-[11px] text-[#5F7300] font-dm uppercase tracking-[0.25em] mt-2 font-bold">Your Silent Space</p>
                </div>
              )}

              {/* TIMER VIEW OR SETUP VIEW */}
              {lockInCompleted ? (
                /* SESSION COMPLETED VIEW */
                <div className="max-w-md mx-auto text-center py-12 space-y-8 animate-welcome-label-input z-10">
                  <div className="space-y-4">
                    <div className="text-4xl">⚡</div>
                    <h3 className="text-2xl font-bold text-[#200F07] font-space tracking-tight">
                      Done! You locked in for {sessionCompletedMinutes} {sessionCompletedMinutes === 1 ? "min" : "mins"}
                    </h3>
                  </div>

                  {/* Question and Interactive actions */}
                  <div className="space-y-6 bg-white/40 p-8 rounded-[24px] border border-[#200F07]/5 shadow-sm">
                    {lockInType === "task" ? (
                      <div className="text-sm text-[#200F07]/80 font-dm">
                        Mark <strong className="font-bold">"{(() => {
                          const t = tasks.find(item => item.id === selectedTaskId);
                          return t ? t.title : (customFocusTarget || "Custom Task");
                        })()}"</strong> as complete? ✓
                      </div>
                    ) : (
                      <div className="text-sm text-[#200F07]/80 font-dm">
                        Mark today's <strong className="font-bold">"{(() => {
                          const h = habits.find(item => item.id === selectedHabitId);
                          return h ? h.name : (customFocusTarget || "Custom Habit");
                        })()}"</strong> as done? ✓
                      </div>
                    )}

                    <div className="flex justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          // Perform complete action
                          if (lockInType === "task") {
                            if (selectedTaskId && selectedTaskId !== "custom") {
                              const saved = localStorage.getItem("clutch_tasks");
                              if (saved) {
                                let parsedTasks: Task[] = JSON.parse(saved);
                                parsedTasks = parsedTasks.map(t => {
                                  if (t.id === selectedTaskId) {
                                    return {
                                      ...t,
                                      completed: true,
                                      completedAt: new Date().toISOString()
                                    };
                                  }
                                  return t;
                                });
                                localStorage.setItem("clutch_tasks", JSON.stringify(parsedTasks));
                                window.dispatchEvent(new Event('tasksUpdated'));
                                alert("✓ Marked as complete in Mission Control!");
                              }
                            }
                          } else {
                            if (selectedHabitId && selectedHabitId !== "custom") {
                              const saved = localStorage.getItem("clutch_habits");
                              if (saved) {
                                let parsedHabits: Habit[] = JSON.parse(saved);
                                const todayStr = new Date().toISOString().split("T")[0];
                                parsedHabits = parsedHabits.map(h => {
                                  if (h.id === selectedHabitId) {
                                    const exists = h.history.includes(todayStr);
                                    return {
                                      ...h,
                                      history: exists ? h.history : [...h.history, todayStr]
                                    };
                                  }
                                  return h;
                                });
                                localStorage.setItem("clutch_habits", JSON.stringify(parsedHabits));
                                window.dispatchEvent(new Event('habitsUpdated'));
                                alert("✓ Marked as done in Streaks!");
                              }
                            }
                          }
                          // Return to selection screen
                          setLockInCompleted(false);
                          setIsLockingIn(false);
                        }}
                        className="px-6 py-3 bg-[#200F07] text-[#EBFFAA] font-space font-bold text-xs uppercase tracking-wider rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                      >
                        Yes, mark it!
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLockInCompleted(false);
                          setIsLockingIn(false);
                        }}
                        className="px-6 py-3 border border-[#200F07]/10 hover:border-[#200F07]/30 bg-white text-[#200F07] font-dm font-bold text-xs rounded-full transition-all cursor-pointer shadow-sm"
                      >
                        Start Again
                      </button>
                    </div>
                  </div>
                </div>
              ) : isLockingIn ? (
                /* PHASE 2 - ACTIVE FOCUS MODE */
                <div className="relative max-w-xl mx-auto text-center py-12 flex flex-col items-center justify-center min-h-[400px] z-10 w-full animate-welcome-label-input">
                  {/* Top left corner (Change Background button) */}
                  <div className="absolute top-0 -left-6 md:-left-16 lg:-left-24">
                    {lockInMode === "focus" && (
                      <button
                        type="button"
                        onClick={() => setFocusBgIndex((prev) => (prev + 1) % FOCUS_BACKGROUNDS.length)}
                        className="w-8 h-8 flex items-center justify-center text-[#EBFFAA] hover:text-[#fff] bg-[#0d1f0f]/60 hover:bg-[#0d1f0f]/85 backdrop-blur-md border border-[#EBFFAA]/30 hover:border-[#EBFFAA]/60 rounded-full transition-all cursor-pointer shadow-lg active:scale-95"
                        title="Change nature background"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Top right corner (Exit Session button) */}
                  <div className="absolute top-0 right-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLockingIn(false);
                        setLockInCompleted(false);
                        setLockInIsPaused(false);
                        setSavedFocusSecondsLeft(null);
                        setSavedFocusTotalDuration(null);
                      }}
                      className={`font-dm text-[13px] font-bold transition-colors cursor-pointer ${
                        lockInMode === "focus" ? "text-[#C5E384] hover:text-[#C5E384]/80" : "text-[#D4B2FF] hover:text-[#D4B2FF]/80"
                      }`}
                    >
                      ← Exit Session
                    </button>
                  </div>

                  {/* Giant Timer (Space Grotesk 700, 80px, #200F07 or #EBFFAA) */}
                  <div className={`text-[80px] font-space font-bold tracking-tighter select-none leading-none tabular-nums ${
                    lockInMode === "focus" ? "text-[#EBFFAA]" : "text-[#E6D7FF]"
                  }`}>
                    {(() => {
                      const totalSeconds = lockInSecondsLeft;
                      const hrs = Math.floor(totalSeconds / 3600);
                      const mins = Math.floor((totalSeconds % 3600) / 60);
                      const secs = totalSeconds % 60;
                      
                      // Never show hours unless session is 60+ mins (strictly > 60 mins, i.e., 3600 seconds)
                      // If 60 mins (3600 seconds), show as 60:00 not 1:00:00
                      if (totalSeconds <= 3600) {
                        const totalMins = Math.floor(totalSeconds / 60);
                        return `${totalMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                      } else {
                        const mm = mins.toString().padStart(2, "0");
                        const ss = secs.toString().padStart(2, "0");
                        return `${hrs}:${mm}:${ss}`;
                      }
                    })()}
                  </div>

                  {/* Selected Task/Habit Name (small, gray, DM Sans) */}
                  <p className={`text-xs font-dm mt-2 max-w-md truncate font-bold ${
                    lockInMode === "focus" ? "text-[#EBFFAA]/70" : "text-[#E6D7FF]/70"
                  }`}>
                    {(() => {
                      if (lockInType === "task") {
                        const t = tasks.find(item => item.id === selectedTaskId);
                        return t ? t.title : (customFocusTarget || "Custom Focus Session");
                      } else {
                        const h = habits.find(item => item.id === selectedHabitId);
                        return h ? h.name : (customFocusTarget || "Custom Focus Session");
                      }
                    })()}
                  </p>

                  {/* Thin progress bar */}
                  <div className={`w-64 h-1 rounded-full overflow-hidden my-6 relative z-10 ${
                    lockInMode === "focus" ? "bg-[#EBFFAA]/10" : "bg-[#E6D7FF]/10"
                  }`}>
                    <div
                      className="h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((lockInTotalDuration - lockInSecondsLeft) / lockInTotalDuration) * 100))}%`,
                        backgroundColor: lockInMode === "break" ? "#D4B2FF" : "#C5E384"
                      }}
                    />
                  </div>

                  {/* Status: "FOCUSING" or "BREAK TIME ☕" */}
                  <div className="text-xs font-dm font-bold uppercase tracking-[0.2em] mb-8 relative z-10">
                    {lockInMode === "focus" ? (
                      <span className="text-[#C5E384]">FOCUSING</span>
                    ) : (
                      <span className="text-[#D4B2FF]">BREAK TIME ☕</span>
                    )}
                  </div>

                  {/* Minimal Pause / Take a Break / End Session Buttons */}
                  <div className="flex items-center gap-4 relative z-10">
                    <button
                      type="button"
                      onClick={() => setLockInIsPaused(!lockInIsPaused)}
                      className={`px-6 py-2 border font-dm font-bold text-xs rounded-full transition-all cursor-pointer shadow-sm active:translate-y-[0.5px] ${
                        lockInMode === "focus"
                          ? "border-[#EBFFAA] hover:bg-[#EBFFAA]/10 text-[#EBFFAA] bg-transparent"
                          : "border-[#E6D7FF] hover:bg-[#E6D7FF]/10 text-[#E6D7FF] bg-transparent"
                      }`}
                    >
                      {lockInIsPaused ? "▶ Resume" : "⏸ Pause"}
                    </button>

                    {lockInMode === "focus" ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Save current focus seconds and total duration
                          setSavedFocusSecondsLeft(lockInSecondsLeft);
                          setSavedFocusTotalDuration(lockInTotalDuration);
                          
                          // Switch to break mode
                          setLockInMode("break");
                          
                          // Break duration is 20% of selected focus time
                          const breakSecs = Math.round(activeFocusMinutes * 0.2 * 60);
                          setLockInSecondsLeft(breakSecs);
                          setLockInTotalDuration(breakSecs);
                          
                          // Ensure timer is not paused
                          setLockInIsPaused(false);
                        }}
                        className="px-6 py-2 border border-[#EBFFAA] hover:bg-[#EBFFAA]/10 text-[#EBFFAA] bg-transparent font-dm font-bold text-xs rounded-full transition-all cursor-pointer shadow-sm active:translate-y-[0.5px]"
                      >
                        ☕ Take a Break
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setLockInMode("focus");
                          if (savedFocusSecondsLeft !== null) {
                            setLockInSecondsLeft(savedFocusSecondsLeft);
                            if (savedFocusTotalDuration !== null) {
                              setLockInTotalDuration(savedFocusTotalDuration);
                            }
                            setSavedFocusSecondsLeft(null);
                            setSavedFocusTotalDuration(null);
                          } else {
                            const focusSecs = activeFocusMinutes * 60;
                            setLockInSecondsLeft(focusSecs);
                            setLockInTotalDuration(focusSecs);
                          }
                          setLockInIsPaused(false);
                        }}
                        className="px-6 py-2 border border-[#200F07]/15 hover:border-[#200F07]/30 bg-white text-[#200F07] font-dm font-bold text-xs rounded-full transition-all cursor-pointer shadow-sm active:translate-y-[0.5px]"
                      >
                        Back to Focus →
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const elapsedMinutes = Math.max(1, Math.round((lockInTotalDuration - lockInSecondsLeft) / 60));
                        setSessionCompletedMinutes(lockInMode === "focus" ? elapsedMinutes : activeFocusMinutes);
                        setIsLockingIn(false);
                        setLockInCompleted(true);
                        setSavedFocusSecondsLeft(null);
                        setSavedFocusTotalDuration(null);
                        try {
                          if (typeof confetti === "function") {
                            confetti({
                              particleCount: 60,
                              spread: 50,
                              origin: { y: 0.6 }
                            });
                          }
                        } catch (e) {}
                      }}
                      className={`px-6 py-2 border font-dm font-bold text-xs rounded-full transition-all cursor-pointer shadow-sm active:translate-y-[0.5px] ${
                        lockInMode === "focus"
                          ? "border-[#EBFFAA] hover:bg-[#EBFFAA]/10 text-[#EBFFAA] bg-transparent"
                          : "border-[#200F07]/15 hover:border-[#200F07]/30 bg-white text-[#200F07]"
                      }`}
                    >
                      ✕ End Session
                    </button>
                  </div>
                </div>
              ) : (
                /* PHASE 1 - SETUP / SELECTION VIEW (DEFAULT) */
                <div className="space-y-12 max-w-xl mx-auto w-full py-4 z-10">
                  
                  {/* SECTION 2 - Select Target */}
                  <div className="flex flex-col items-center gap-5 text-center relative -translate-x-3 md:-translate-x-8 lg:-translate-x-12 transition-all duration-300">
                    <span className="text-[11px] text-[#5F7300] font-dm font-bold uppercase tracking-[0.15em]">
                      WHAT ARE YOU LOCKING IN ON?
                    </span>
                    
                    <div className="flex gap-2.5 bg-[#200F07]/5 p-1 rounded-full border border-[#200F07]/5">
                      <button
                        type="button"
                        onClick={() => {
                          setLockInType("task");
                          setCustomFocusTarget("");
                        }}
                        className={`px-8 py-2.5 rounded-full font-dm font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                          lockInType === "task"
                            ? "bg-[#200F07] text-[#EBFFAA] shadow-sm"
                            : "text-[#200F07]/70 hover:text-[#200F07] hover:bg-[#200F07]/5"
                        }`}
                      >
                        A Task
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLockInType("habit");
                          setCustomFocusTarget("");
                        }}
                        className={`px-8 py-2.5 rounded-full font-dm font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                          lockInType === "habit"
                            ? "bg-[#200F07] text-[#EBFFAA] shadow-sm"
                            : "text-[#200F07]/70 hover:text-[#200F07] hover:bg-[#200F07]/5"
                        }`}
                      >
                        A Habit
                      </button>
                    </div>

                    {/* Conditional drop down select */}
                    <div className="w-full max-w-md">
                      {lockInType === "task" ? (
                        <div className="space-y-3">
                          {(() => {
                            const incompleteTasks = tasks.filter(t => !t.completed);
                            if (incompleteTasks.length === 0) {
                              return (
                                <div className="text-center p-5 bg-white border border-[#200F07]/10 rounded-2xl shadow-sm">
                                  <p className="text-xs text-[#200F07]/60 font-dm mb-3">
                                    No incomplete tasks in Volt task list.
                                  </p>
                                  <input
                                    type="text"
                                    placeholder="Type a custom lock-in task here..."
                                    value={customFocusTarget}
                                    onChange={(e) => setCustomFocusTarget(e.target.value)}
                                    className="w-full px-4 py-3 bg-[#FFFFF5] rounded-xl border border-[#200F07]/10 text-xs font-dm text-[#200F07] focus:outline-none focus:border-[#C5E384] text-center"
                                  />
                                </div>
                              );
                            }

                            // Pre-select first task if none selected
                            if (!selectedTaskId && incompleteTasks.length > 0) {
                              setTimeout(() => setSelectedTaskId(incompleteTasks[0].id), 0);
                            }

                            return (
                              <div className="space-y-3">
                                <select
                                  value={selectedTaskId}
                                  onChange={(e) => {
                                    setSelectedTaskId(e.target.value);
                                    if (e.target.value !== "custom") {
                                      setCustomFocusTarget("");
                                    }
                                  }}
                                  className="w-full px-4 py-3.5 bg-white rounded-xl border border-[#200F07]/10 text-sm font-dm text-[#200F07] focus:outline-none focus:border-[#C5E384] cursor-pointer shadow-sm"
                                >
                                  {incompleteTasks.map(t => (
                                    <option key={t.id} value={t.id}>
                                      {t.title} {t.deadline ? `(Due: ${t.deadline})` : ""}
                                    </option>
                                  ))}
                                  <option value="custom">✍️ Type Custom Focus Task...</option>
                                </select>

                                {selectedTaskId === "custom" && (
                                  <input
                                    type="text"
                                    placeholder="What custom task are you focusing on?"
                                    value={customFocusTarget}
                                    onChange={(e) => setCustomFocusTarget(e.target.value)}
                                    className="w-full px-4 py-3 bg-white rounded-xl border border-[#200F07]/10 text-xs font-dm text-[#200F07] focus:outline-none focus:border-[#C5E384] text-center shadow-sm"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(() => {
                            if (habits.length === 0) {
                              return (
                                <div className="text-center p-5 bg-white border border-[#200F07]/10 rounded-2xl shadow-sm">
                                  <p className="text-xs text-[#200F07]/60 font-dm mb-3">
                                    No habits found in Volt habit list.
                                  </p>
                                  <input
                                    type="text"
                                    placeholder="Type a custom lock-in habit here..."
                                    value={customFocusTarget}
                                    onChange={(e) => setCustomFocusTarget(e.target.value)}
                                    className="w-full px-4 py-3 bg-[#FFFFF5] rounded-xl border border-[#200F07]/10 text-xs font-dm text-[#200F07] focus:outline-none focus:border-[#C5E384] text-center"
                                  />
                                </div>
                              );
                            }

                            // Pre-select first habit if none selected
                            if (!selectedHabitId && habits.length > 0) {
                              setTimeout(() => setSelectedHabitId(habits[0].id), 0);
                            }

                            return (
                              <div className="space-y-3">
                                <select
                                  value={selectedHabitId}
                                  onChange={(e) => {
                                    setSelectedHabitId(e.target.value);
                                    if (e.target.value !== "custom") {
                                      setCustomFocusTarget("");
                                    }
                                  }}
                                  className="w-full px-4 py-3.5 bg-white rounded-xl border border-[#200F07]/10 text-sm font-dm text-[#200F07] focus:outline-none focus:border-[#C5E384] cursor-pointer shadow-sm"
                                >
                                  {habits.map(h => (
                                    <option key={h.id} value={h.id}>
                                      {h.name} {h.targetDuration ? `(${h.targetDuration})` : ""}
                                    </option>
                                  ))}
                                  <option value="custom">✍️ Type Custom Focus Habit...</option>
                                </select>

                                {selectedHabitId === "custom" && (
                                  <input
                                    type="text"
                                    placeholder="What custom habit are you locking in on?"
                                    value={customFocusTarget}
                                    onChange={(e) => setCustomFocusTarget(e.target.value)}
                                    className="w-full px-4 py-3 bg-white rounded-xl border border-[#200F07]/10 text-xs font-dm text-[#200F07] focus:outline-none focus:border-[#C5E384] text-center shadow-sm"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3 - Duration Selection */}
                  <div className="flex flex-col items-center gap-5 text-center">
                    <span className="text-[11px] text-[#5F7300] font-dm font-bold uppercase tracking-[0.15em]">
                      HOW LONG WILL YOU FOCUS?
                    </span>

                    {parsedHabitMinutes !== null ? (
                      <p className="font-dm text-[14px] text-[#5F7300]">
                        ⏱ Locking in for {selectedHabit?.targetDuration || `${parsedHabitMinutes} mins`} (based on your habit goal)
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap justify-center gap-3">
                          {[25, 45, 60].map((mins) => (
                            <button
                              type="button"
                              key={mins}
                              onClick={() => {
                                  setFocusPreset(mins as any);
                                  setCustomMinutes("");
                              }}
                              className={`px-6 py-3 rounded-full font-dm font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border ${
                                focusPreset === mins
                                  ? "bg-[#200F07] text-[#EBFFAA] border-[#200F07] shadow-sm"
                                  : "bg-white text-[#200F07] border-[#200F07]/10 hover:border-[#200F07]/30 hover:scale-[1.01]"
                              }`}
                            >
                              {mins} min
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFocusPreset("custom")}
                            className={`px-6 py-3 rounded-full font-dm font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border ${
                              focusPreset === "custom"
                                ? "bg-[#200F07] text-[#EBFFAA] border-[#200F07] shadow-sm"
                                : "bg-white text-[#200F07] border-[#200F07]/10 hover:border-[#200F07]/30 hover:scale-[1.01]"
                            }`}
                          >
                            Custom
                          </button>
                        </div>

                        {focusPreset === "custom" && (
                          <div className="w-full max-w-xs flex items-center gap-2 bg-white rounded-xl border border-[#200F07]/10 px-4 py-2.5 shadow-inner">
                            <input
                              type="number"
                              min="1"
                              max="180"
                              placeholder="or type custom minutes"
                              value={customMinutes}
                              onChange={(e) => setCustomMinutes(e.target.value)}
                              className="w-full text-center text-xs font-dm text-[#200F07] focus:outline-none bg-transparent"
                            />
                            <span className="text-[10px] text-[#200F07]/40 font-dm font-bold uppercase shrink-0">mins</span>
                          </div>
                        )}

                        {/* Work / Break Ratio Label */}
                        <div className="bg-[#5F7300]/10 px-5 py-2.5 rounded-full text-xs font-dm font-bold text-[#5F7300] tracking-wider uppercase">
                          {focusPreset === 25 && "25 min focus + 5 min break"}
                          {focusPreset === 45 && "45 min focus + 10 min break"}
                          {focusPreset === 60 && "60 min focus + 15 min break"}
                          {focusPreset === "custom" && `${activeFocusMinutes} min focus + ${activeBreakMinutes} min break`}
                        </div>
                      </>
                    )}
                  </div>

                  {/* SECTION 4 - Start Button */}
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Make sure we have a label
                        if (lockInType === "task" && selectedTaskId !== "custom" && !selectedTaskId) {
                          const incomplete = tasks.filter(t => !t.completed);
                          if (incomplete.length > 0) {
                            setSelectedTaskId(incomplete[0].id);
                          }
                        }
                        if (lockInType === "habit" && selectedHabitId !== "custom" && !selectedHabitId) {
                          if (habits.length > 0) {
                            setSelectedHabitId(habits[0].id);
                          }
                        }

                        const seconds = activeFocusMinutes * 60;
                        setLockInSecondsLeft(seconds);
                        setLockInTotalDuration(seconds);
                        setLockInMode("focus");
                        setLockInIsPaused(false);
                        setLockInCompleted(false);
                        setSavedFocusSecondsLeft(null);
                        setSavedFocusTotalDuration(null);
                        setIsLockingIn(true);
                      }}
                      className="w-[280px] py-4 bg-[#200F07] text-[#EBFFAA] font-space font-bold text-base uppercase tracking-[0.05em] rounded-[100px] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 shadow-lg shadow-[#200F07]/10 cursor-pointer flex items-center justify-center gap-2"
                    >
                      ⚡ START LOCKING IN
                    </button>
                  </div>

                </div>
              )}

              {/* SECTION 6 - PINNED VINYL MUSIC PLAYER */}
              <div 
                className="fixed bottom-0 z-40 transition-all duration-300 pointer-events-none"
                style={{
                  left: isSidebarCollapsed ? "48px" : "240px",
                  marginLeft: "8px",
                  marginBottom: "8px",
                  transform: "scale(0.85)",
                  transformOrigin: "bottom left",
                  display: (isLockingIn || lockInCompleted) ? "block" : "none"
                }}
              >
                {/* Square-edged Earthy-Themed Vinyl Player */}
                <div className="w-[340px] h-[82px] rounded-none p-2 bg-[#200F07] border-2 border-[#C5E384]/60 shadow-[0_10px_24px_rgba(0,0,0,0.3)] pointer-events-auto relative select-none flex items-center justify-between gap-2">
                  
                  {/* Left Column: Rotating Vinyl Record & ToneArm */}
                  <div className="relative shrink-0 flex items-center justify-center">
                    {/* Dark Record Bed/Well */}
                    <div className="w-14 h-14 rounded-full bg-gradient-to-b from-[#0d1f0f] to-[#200F07] border border-[#C5E384]/30 shadow-inner flex items-center justify-center relative">
                      
                      {/* Vinyl Groove circle */}
                      <div 
                        className={`w-12 h-12 rounded-full bg-[#1A110D] flex items-center justify-center shadow-md relative z-10 ${
                          isAmbientPlaying ? "spinning-record" : ""
                        }`}
                        style={{
                          backgroundImage: "radial-gradient(circle, #200F07 30%, #351e13 31%, #200F07 40%, #1a0b06 41%, #200F07 55%, #150804 56%, #200F07 70%, #100402 71%)"
                        }}
                      >
                        {/* Center Pink/Red Label */}
                        <div className="w-4 h-4 rounded-full bg-[#E76D76] border border-black/25 flex items-center justify-center relative shadow-inner z-10">
                          {/* Inner gold/silver ring */}
                          <div className="w-2 h-2 rounded-full border border-[#FFF9EB]/25 bg-gradient-to-tr from-[#C24F57] to-[#ED8088] flex items-center justify-center">
                            {/* Pin hole */}
                            <div className="w-1 h-1 bg-[#FFF9EB] rounded-full shadow-inner"></div>
                          </div>
                        </div>
                      </div>

                      {/* Silver ToneArm (pivots onto record when playing, and swings away when paused) */}
                      <svg 
                        className="absolute -top-0.5 -right-0.5 w-6 h-10 z-20 pointer-events-none transition-transform duration-700 origin-[5px_5px]"
                        style={{
                          transform: isAmbientPlaying ? "rotate(16deg)" : "rotate(-25deg)"
                        }}
                        viewBox="0 0 20 28"
                        fill="none"
                      >
                        {/* Metallic Pivot cap */}
                        <circle cx="5" cy="5" r="3" fill="url(#metal-grad-small)" stroke="#8A7B70" strokeWidth="0.75" />
                        <circle cx="5" cy="5" r="1.5" fill="#6B5E54" />
                        <circle cx="5" cy="5" r="0.5" fill="#FFF" />
                        
                        {/* Curved metallic pole */}
                        <path d="M 5 5 C 8 8, 11 11, 12 17 L 10 23 L 9 24" stroke="url(#metal-grad-pole-small)" strokeWidth="1.2" strokeLinecap="round" />
                        
                        {/* Cartridge / needle-head */}
                        <rect x="8.5" y="23" width="2.5" height="1.5" rx="0.3" transform="rotate(-15 8.5 23)" fill="#44382F" stroke="#2D231B" strokeWidth="0.5" />
                        <circle cx="9" cy="23.5" r="0.3" fill="#FFF" />
                      </svg>
                    </div>
                  </div>

                  {/* Middle Column: Active Track & Tactile controls */}
                  <div className="flex-1 flex flex-col items-center justify-center min-w-0">
                    {/* Title with elegant Author / Song slash style */}
                    <h4 className="text-[11px] font-space font-bold text-[#EBFFAA] truncate w-full max-w-[130px] tracking-tight leading-none text-center mb-1.5">
                      {(() => {
                        const tr = AMBIENT_TRACKS.find(t => t.id === ambientTrack);
                        const name = tr?.name || "Ambient Music";
                        const icon = tr?.icon || "🎵";
                        return `Volt ${icon} / ${name}`;
                      })()}
                    </h4>

                    {/* Raised Skeuomorphic Button Row */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Prev Track */}
                      <button
                        type="button"
                        onClick={() => {
                          const idx = AMBIENT_TRACKS.findIndex(t => t.id === ambientTrack);
                          const prevIdx = (idx - 1 + AMBIENT_TRACKS.length) % AMBIENT_TRACKS.length;
                          setAmbientTrack(AMBIENT_TRACKS[prevIdx].id as any);
                          setAmbientTime(0);
                        }}
                        className="w-6.5 h-6.5 rounded-none bg-[#0d1f0f] border border-[#C5E384]/30 flex items-center justify-center shadow-sm active:translate-y-[0.5px] hover:bg-[#0d1f0f]/80 transition-all cursor-pointer text-[#EBFFAA]"
                        title="Previous Soundscape"
                      >
                        <SkipBack className="w-3 h-3 fill-current text-[#EBFFAA]" />
                      </button>

                      {/* Play / Pause Toggle (Red-pink centered beauty) */}
                      <button
                        type="button"
                        onClick={() => setIsAmbientPlaying(!isAmbientPlaying)}
                        className="w-7.5 h-7.5 rounded-none bg-[#C5E384] border border-[#C5E384] flex items-center justify-center shadow-md active:translate-y-[0.5px] hover:bg-[#EBFFAA] transition-all cursor-pointer text-[#200F07]"
                        title={isAmbientPlaying ? "Pause Soundscape" : "Play Soundscape"}
                      >
                        {isAmbientPlaying ? (
                          <Pause className="w-3 h-3 fill-current text-[#200F07]" />
                        ) : (
                          <Play className="w-3 h-3 fill-current text-[#200F07] translate-x-0.5" />
                        )}
                      </button>

                      {/* Next Track */}
                      <button
                        type="button"
                        onClick={() => {
                          const idx = AMBIENT_TRACKS.findIndex(t => t.id === ambientTrack);
                          const nextIdx = (idx + 1) % AMBIENT_TRACKS.length;
                          setAmbientTrack(AMBIENT_TRACKS[nextIdx].id as any);
                          setAmbientTime(0);
                        }}
                        className="w-6.5 h-6.5 rounded-none bg-[#0d1f0f] border border-[#C5E384]/30 flex items-center justify-center shadow-sm active:translate-y-[0.5px] hover:bg-[#0d1f0f]/80 transition-all cursor-pointer text-[#EBFFAA]"
                        title="Next Soundscape"
                      >
                        <SkipForward className="w-3 h-3 fill-current text-[#EBFFAA]" />
                      </button>

                      {/* Tracks popover dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowTrackSelector(!showTrackSelector)}
                          className={`w-6.5 h-6.5 rounded-none border flex items-center justify-center transition-all cursor-pointer ${
                            showTrackSelector 
                              ? "bg-[#C5E384] border-[#C5E384] text-[#200F07]" 
                              : "bg-[#0d1f0f] border-[#C5E384]/30 hover:bg-[#0d1f0f]/80 text-[#EBFFAA]"
                          }`}
                          title="Select Soundscape"
                        >
                          <ListMusic className="w-3 h-3 text-current" />
                        </button>

                        {/* Dropdown Popover */}
                        {showTrackSelector && (
                          <div className="absolute bottom-9 right-1/2 translate-x-1/2 w-40 rounded-none bg-[#200F07] border border-[#C5E384]/30 shadow-[0_8px_20px_rgba(0,0,0,0.4)] p-1 z-50 animate-welcome-label-input">
                            <p className="text-[8px] font-dm uppercase tracking-wider font-bold text-[#C5E384]/50 px-2 py-0.5 border-b border-[#C5E384]/10 mb-1 text-center">
                              Soundscapes
                            </p>
                            {AMBIENT_TRACKS.map((t) => {
                              const isActive = ambientTrack === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    setAmbientTrack(t.id as any);
                                    setIsAmbientPlaying(true);
                                    setAmbientTime(0);
                                    setShowTrackSelector(false);
                                  }}
                                  className={`w-full text-left px-2 py-1 rounded-none text-[11px] font-dm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                                    isActive
                                      ? "bg-[#C5E384] text-[#200F07]"
                                      : "text-[#EBFFAA] hover:bg-[#0d1f0f]"
                                  }`}
                                >
                                  <span className="text-xs">{t.icon}</span>
                                  <span className="truncate font-bold">{t.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Duration display */}
                    <p className="font-dm font-bold text-[8px] text-[#C5E384]/70 tracking-wide mt-1 uppercase select-none">
                      {Math.floor(ambientTime / 60)}:{(ambientTime % 60).toString().padStart(2, "0")} / 4:00
                    </p>
                  </div>

                  {/* Right Column: Circular Volume Gauge & Speaker dial */}
                  <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                    
                    {/* High-Contrast Concentric SVG Gauge Track */}
                    <svg className="absolute w-12 h-12 transform -rotate-[220deg] pointer-events-none" viewBox="0 0 100 100">
                      {/* Grey background arc */}
                      <circle 
                        cx="50" 
                        cy="50" 
                        r="36" 
                        fill="none" 
                        stroke="#C5E384" 
                        strokeWidth="5" 
                        strokeDasharray="180 360"
                        strokeLinecap="round"
                        opacity="0.12"
                      />
                      {/* Red/pink active arc representing current volume */}
                      <circle 
                        cx="50" 
                        cy="50" 
                        r="36" 
                        fill="none" 
                        stroke="#EBFFAA" 
                        strokeWidth="5.5" 
                        strokeDasharray="180 360"
                        strokeDashoffset={180 - (180 * ambientVolume)}
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* Speaker Button Dial (Tap cycles volume levels or mutes/unmutes) */}
                    <button
                      type="button"
                      onClick={() => {
                        // Cycles through 0.0, 0.3, 0.6, 1.0
                        setAmbientVolumeState(prev => {
                          if (prev === 0) return 0.3;
                          if (prev > 0 && prev <= 0.35) return 0.6;
                          if (prev > 0.35 && prev <= 0.65) return 1.0;
                          return 0;
                        });
                      }}
                      className="w-6.5 h-6.5 rounded-none bg-[#0d1f0f] border border-[#C5E384]/30 flex items-center justify-center shadow-sm hover:bg-[#0d1f0f]/80 active:translate-y-[0.5px] cursor-pointer transition-all text-[#EBFFAA] z-10"
                      title={`Volume: ${Math.round(ambientVolume * 100)}% (Tap to Cycle)`}
                    >
                      {ambientVolume === 0 ? (
                        <VolumeX className="w-3 h-3 text-[#EBFFAA]" />
                      ) : (
                        <Volume2 className="w-3 h-3 text-[#EBFFAA]" />
                      )}
                    </button>
                    
                    {/* Volume Level small floating text overlay */}
                    <span className="absolute -bottom-1 text-[7px] font-bold text-[#C5E384]/50 uppercase tracking-widest pointer-events-none select-none">
                      {ambientVolume === 0 ? "Muted" : `${Math.round(ambientVolume * 100)}%`}
                    </span>
                  </div>

                </div>

                {/* Shared metal gradients for SVG rendering */}
                <svg className="absolute w-0 h-0" width="0" height="0">
                  <defs>
                    <linearGradient id="metal-grad-small" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FFF" />
                      <stop offset="50%" stopColor="#B2A396" />
                      <stop offset="100%" stopColor="#6B5E54" />
                    </linearGradient>
                    <linearGradient id="metal-grad-pole-small" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FFF" />
                      <stop offset="100%" stopColor="#8A7B70" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

            </div>
          ) : null}
          
          {activeTab === "stats" ? (
            <div id="section-stats" className="col-span-1 lg:col-span-3 space-y-8">
              {/* Stats Welcome Banner */}
              <div className="mb-2">
                <h2 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[#200F07] font-space leading-tight">
                  Hey {userName}, here's your progress
                </h2>
                <p className="text-sm text-[#200F07]/70 font-dm mt-1">
                  Track your overall productivity metrics, streaks, and scores
                </p>
              </div>
              
              {/* SECTION 1 - Overall Clutch Score */}
              <div className="flex flex-col items-center justify-center p-8 bg-[#FFF9EB] rounded-xl border border-[#C5E384] shadow-sm">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90">
                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-[#C5E384]/30" />
                    <circle 
                      cx="96" cy="96" r="88" 
                      stroke="currentColor" strokeWidth="12" fill="transparent" 
                      strokeDasharray="552.92" 
                      strokeDashoffset={552.92 - (552.92 * ((taskScoreDetails.score + habitScoreDetails.score) / 2)) / 100}
                      className="text-[#200F07]"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-center absolute">
                    <span className="block text-5xl font-black text-[#200F07] leading-none font-space">
                      {Math.round((taskScoreDetails.score + habitScoreDetails.score) / 2)}
                    </span>
                    <span className="block text-sm font-dm text-[#200F07]/60 mt-1 font-bold">/100</span>
                  </div>
                </div>
                <h2 className="mt-6 text-lg font-bold tracking-tight text-[#200F07] font-space">
                  {((taskScoreDetails.score + habitScoreDetails.score) / 2) >= 80 ? "You're crushing it!" : ((taskScoreDetails.score + habitScoreDetails.score) / 2) >= 50 ? "Making progress" : "Time to focus!"}
                </h2>
                <p className="text-xs text-[#200F07]/60 font-dm uppercase tracking-wider mt-1 font-bold">
                  Your overall productivity score today
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* SECTION 2 - Task Stats */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#200F07] border-b border-[#C5E384]/40 pb-2 mb-4 font-space">
                      Task Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-4 rounded-lg bg-[#FFF9EB] border border-[#C5E384] text-center shadow-sm">
                        <span className="block text-3xl font-black text-[#200F07] font-space">{tasks.length}</span>
                        <span className="block text-xs font-dm uppercase tracking-wider text-[#200F07]/60 mt-1 font-bold">Total Tasks</span>
                      </div>
                      <div className="p-4 rounded-lg bg-[#C5E384]/20 border border-[#C5E384] text-center shadow-sm">
                        <span className="block text-3xl font-black text-[#200F07] font-space">
                          {tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(new Date().toISOString().split('T')[0])).length}
                        </span>
                        <span className="block text-xs font-dm uppercase tracking-wider text-[#200F07]/80 mt-1 font-bold">Completed Today</span>
                      </div>
                      <div className="p-4 rounded-lg bg-red-50/50 border border-red-200 text-center shadow-sm">
                        <span className="block text-3xl font-black text-red-700 font-space">{riskAlerts.length}</span>
                        <span className="block text-xs font-dm uppercase tracking-wider text-red-700/80 mt-1 font-bold">At Risk</span>
                      </div>
                      <div className="p-4 rounded-lg bg-yellow-50/50 border border-yellow-200 text-center shadow-sm">
                        <span className="block text-3xl font-black text-yellow-800 font-space">
                          {tasks.filter(t => !t.completed && t.deadline && t.deadline.split('T')[0] < new Date().toISOString().split('T')[0]).length}
                        </span>
                        <span className="block text-xs font-dm uppercase tracking-wider text-yellow-800/80 mt-1 font-bold">Overdue</span>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-dm uppercase tracking-wider text-[#200F07]/60 mb-3 font-bold">Completion by Category</h4>
                      <div className="space-y-3">
                        {["Work", "Study", "Personal", "Other"].map(cat => {
                          const catTasks = tasks.filter(t => t.category === cat);
                          const comp = catTasks.filter(t => t.completed).length;
                          const total = catTasks.length;
                          const pct = total === 0 ? 0 : Math.round((comp / total) * 100);
                          return (
                            <div key={cat} className="space-y-1">
                              <div className="flex justify-between text-xs font-dm font-bold text-[#200F07]/85">
                                <span>{cat}</span>
                                <span className="text-[#200F07]/60">{comp} / {total}</span>
                              </div>
                              <div className="w-full h-2 bg-[#C5E384]/15 rounded-full overflow-hidden">
                                <div className="h-full bg-[#200F07] transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3 - Habit Stats */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#200F07] border-b border-[#C5E384]/40 pb-2 mb-4 font-space">
                      Habit Stats
                    </h3>
                    <div className="p-6 bg-[#FFF9EB] border border-[#C5E384] rounded-lg shadow-sm">
                      <div className="flex items-end justify-center gap-4 md:gap-6 h-[250px] mb-4 pb-2 border-b border-neutral-300 overflow-x-auto">
                        {habits.map((habit, i) => {
                          const barColors = [
                            { bg: "bg-[#4B005F]", text: "text-white", border: "border border-[#4B005F]" },
                            { bg: "bg-[#EBFFAA]", text: "text-[#200F07]", border: "border border-[#200F07]" },
                            { bg: "bg-[#C5E384]", text: "text-[#200F07]", border: "border border-[#C5E384]" },
                            { bg: "bg-[#F6D7FF]", text: "text-[#200F07]", border: "border border-[#F6D7FF]" },
                            { bg: "bg-[#200F07]", text: "text-[#FFF9EB]", border: "border border-[#200F07]" }
                          ];
                          const barColorObj = barColors[i % barColors.length];
                          const totalDays = habit.goalDuration || 30;
                          const pct = Math.min(100, Math.round((habit.history.filter(Boolean).length / totalDays) * 100));
                          
                          // Bar height is calculated so that it fills from bottom up. Max is 200px, min is 4px.
                          const barHeight = Math.max(4, Math.round((pct / 100) * 200));
                          const showInside = barHeight > 30;
                          const displayLabel = habit.name.length > 8 ? habit.name.substring(0, 8) + "..." : habit.name;

                          return (
                            <div key={habit.id} className="flex flex-col items-center gap-2 select-none shrink-0 w-[60px]">
                              {/* Bar container: full height of chart area (200px) */}
                              <div className="w-10 h-[200px] bg-[#C5E384]/10 rounded border border-[#C5E384]/15 relative flex flex-col justify-end overflow-visible">
                                {/* Actual bar: fills from BOTTOM up based on completion percentage */}
                                <div 
                                  className={`w-full rounded-b transition-all duration-700 relative flex flex-col items-center justify-center ${barColorObj.bg} ${barColorObj.border}`}
                                  style={{ height: `${barHeight}px` }}
                                >
                                  {showInside ? (
                                    <span className={`text-[9px] font-space font-bold ${barColorObj.text} leading-none pointer-events-none`}>
                                      {pct}%
                                    </span>
                                  ) : (
                                    <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[9px] font-space font-bold text-[#200F07] leading-none pointer-events-none whitespace-nowrap">
                                      {pct}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Habit name below each bar, truncated to max 8 characters */}
                              <span 
                                className="text-[10px] font-dm text-[#200F07]/70 font-semibold truncate text-center w-full" 
                                title={habit.name}
                              >
                                {displayLabel}
                              </span>
                            </div>
                          );
                        })}
                        {habits.length === 0 && (
                          <div className="w-full h-full flex items-center justify-center text-xs font-dm text-[#200F07]/50 font-bold">
                            No habits tracked yet.
                          </div>
                        )}
                      </div>
                      <div className="text-center pt-2">
                        <span className="text-sm font-bold tracking-tight text-[#200F07] font-space">
                          Points Earned This Week: {
                            habits.reduce((acc, h) => {
                              const last7Days = Array.from({length: 7}, (_, i) => {
                                const d = new Date();
                                d.setDate(d.getDate() - i);
                                return d.toISOString().split('T')[0];
                              });
                              let comps = 0;
                              h.history.forEach(date => {
                                if (last7Days.includes(date)) comps++;
                              });
                              return acc + (comps * 10);
                            }, 0)
                          } pts
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4 - Weekly Overview */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#200F07] border-b border-[#C5E384]/40 pb-2 mb-4 font-space">
                  Weekly Overview
                </h3>
                <div className="flex gap-2 justify-between">
                  {Array.from({length: 7}, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (6 - i));
                    const dateStr = d.toISOString().split('T')[0];
                    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
                    const tasksDone = tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(dateStr)).length;
                    const isToday = i === 6;
                    return (
                      <div key={dateStr} className={`flex-1 flex flex-col items-center p-3 rounded-lg border ${isToday ? "border-[#200F07] bg-[#200F07] text-[#FFF9EB]" : "border-[#C5E384] bg-[#FFF9EB] text-[#200F07]"}`}>
                        <span className={`text-[10px] font-dm uppercase tracking-wider mb-2 ${isToday ? "text-[#FFF9EB]/70" : "text-[#200F07]/60"} font-bold`}>{dayName}</span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isToday ? "bg-[#FFF9EB] text-[#200F07]" : "bg-[#FFF9EB] border border-[#C5E384] text-[#200F07]"}`}>
                          {tasksDone}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 5 - Share Progress */}
              <div className="pt-4 flex justify-center pb-8">
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="px-6 py-3 bg-[#200F07] text-[#C5E384] text-sm font-space uppercase tracking-wider rounded-lg hover:bg-[#200F07]/90 transition-colors flex items-center gap-2 cursor-pointer font-bold border-0"
                >
                  <Sparkles className="w-4 h-4" />
                  Share My Progress
                </button>
              </div>

            </div>
          ) : null}

        </div>
      </main>

      {/* Share Progress Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFF9EB] rounded-xl shadow-2xl overflow-hidden w-full max-w-sm border border-[#C5E384]">
            <div className="p-8 bg-[#FFF9EB] border-b border-[#C5E384]/30">
              <h3 className="text-xl font-bold tracking-tight text-center mb-6 text-[#200F07] font-space">My Volt Progress</h3>
              
              <div className="flex flex-col items-center justify-center mb-6">
                <div className="w-24 h-24 rounded-full border-4 border-[#200F07] flex items-center justify-center bg-[#FFF9EB] shadow-inner text-[#200F07]">
                  <span className="text-4xl font-black font-space">{Math.round((taskScoreDetails.score + habitScoreDetails.score) / 2)}</span>
                </div>
                <span className="text-[10px] font-dm uppercase tracking-wider text-[#200F07]/60 mt-3 font-bold">Overall Score</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[#C5E384]/35">
                  <span className="text-xs font-dm uppercase text-[#200F07]/75 font-bold">Tasks Completed Today</span>
                  <span className="font-bold font-space text-[#200F07]">{tasks.filter(t => t.completed && t.completedAt && t.completedAt.startsWith(new Date().toISOString().split('T')[0])).length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#C5E384]/35">
                  <span className="text-xs font-dm uppercase text-[#200F07]/75 font-bold">Best Habit Streak</span>
                  <span className="font-bold font-space text-[#200F07]">
                    {habits.length > 0 ? Math.max(...habits.map(h => calculateStreakForHabit(h.history, new Date().toISOString().split('T')[0]))) : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#C5E384]/35">
                  <span className="text-xs font-dm uppercase text-[#200F07]/75 font-bold">Total Points Earned</span>
                  <span className="font-bold font-space text-[#200F07]">
                    {habits.reduce((acc, h) => {
                      const last7Days = Array.from({length: 7}, (_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        return d.toISOString().split('T')[0];
                      });
                      let comps = 0;
                      h.history.forEach(date => {
                        if (last7Days.includes(date)) comps++;
                      });
                      return acc + (comps * 10);
                    }, 0)} pts
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-dm uppercase text-[#200F07]/75 font-bold">Date</span>
                  <span className="font-bold text-sm font-space text-[#200F07]">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-[#FFF9EB] text-center">
              <p className="text-xs font-dm text-[#200F07]/50 mb-4 font-bold">Screenshot to share!</p>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-6 py-2 bg-[#200F07] hover:bg-[#200F07]/90 text-[#C5E384] text-xs font-space uppercase tracking-wider rounded transition-colors w-full cursor-pointer font-bold border-0"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 30-Day Streak Celebration Modal */}
      {celebrationHabit && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in">
          <div className="bg-[#FFF9EB] rounded-2xl shadow-2xl border border-[#C5E384] overflow-hidden w-full max-w-md transform scale-100 transition-all">
            <div className="p-8 text-center space-y-6">
              {/* Badge */}
              <div className="mx-auto w-24 h-24 rounded-full bg-orange-50 border-4 border-orange-500 flex items-center justify-center shadow-md animate-bounce">
                <span className="text-4xl">🔥</span>
              </div>
              
              <div className="space-y-2">
                <span className="text-[10px] font-dm uppercase tracking-[0.2em] text-orange-600 font-bold bg-orange-50 px-3 py-1 rounded-full border border-orange-200">
                  Ultimate Achievement
                </span>
                <h3 className="text-2xl font-black tracking-tight text-[#200F07] mt-2 font-space">
                  30-Day Streak!
                </h3>
                <p className="text-sm text-[#200F07]/80 font-dm max-w-xs mx-auto">
                  Incredible dedication! You have successfully completed your habit <strong className="text-[#200F07] font-bold">"{celebrationHabit}"</strong> for 30 consecutive days.
                </p>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => setCelebrationHabit(null)}
                className="px-8 py-3 bg-[#200F07] hover:bg-[#200F07]/90 text-[#C5E384] text-xs font-space uppercase tracking-wider rounded-lg transition-all w-full cursor-pointer font-bold shadow-lg active:scale-95 border-0"
              >
                Keep Crushing It! 🔥
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer id="app-footer" className="border-t border-[#C5E384]/30 py-6 px-6 sm:px-12 text-center text-xs text-[#200F07]/50 mt-auto font-dm">
        <p>© {time.getFullYear()} Volt. All rights reserved.</p>
      </footer>

      {/* Floating Chat Widget */}
      <div id="floating-chat-container">
        {/* Floating Toggle Button */}
        <button
          id="button-floating-chat-toggle"
          type="button"
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="fixed bottom-6 right-6 w-[52px] h-[52px] rounded-full flex items-center justify-center bg-[#EBFFAA] text-[#4B005F] shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:opacity-95 active:scale-95 transition-all cursor-pointer z-50 border-0"
          title={isChatOpen ? "Close chat" : "Ask Volt AI"}
        >
          {isChatOpen ? (
            <X size={22} className="text-[#4B005F]" />
          ) : (
            <MessageSquare size={22} className="text-[#4B005F]" />
          )}
        </button>

        {/* Chat Panel */}
        {isChatOpen && (
          <div
            id="chat-panel"
            className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] h-[500px] max-h-[70vh] bg-[#FFF9EB] border border-[#C5E384] rounded-lg shadow-2xl flex flex-col z-50 overflow-hidden animate-fade-in"
          >
            {/* Header */}
            <div
              id="chat-header"
              className="flex items-center justify-between px-4 py-3 border-b border-[#C5E384]/30 bg-[#FFF9EB]"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#200F07] animate-pulse" />
                <span className="font-space text-xs uppercase tracking-wider font-bold text-[#200F07]">
                  Volt AI
                </span>
                {userMood && (
                  <button
                    id="button-edit-mood"
                    type="button"
                    onClick={() => setShowMoodSelector(true)}
                    className="flex items-center gap-1 text-[10px] bg-[#C5E384]/35 hover:bg-[#C5E384]/50 px-1.5 py-0.5 rounded text-[#200F07] font-dm font-bold cursor-pointer transition-colors border-0"
                    title="Change mood"
                  >
                    <span>
                      {userMood === "Overwhelmed" ? "😤 Overwhelmed" : 
                       userMood === "Focused" ? "🎯 Focused" : 
                       userMood === "Tired" ? "😴 Tired" : "💪 Motivated"}
                    </span>
                    <svg className="w-2.5 h-2.5 text-[#200F07]/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                id="button-close-chat"
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1 text-[#200F07]/60 hover:text-[#200F07] hover:bg-[#C5E384]/15 rounded transition-colors cursor-pointer border-0"
              >
                <X size={14} />
              </button>
            </div>

            {(!userMood || showMoodSelector) ? (
              /* PART 3: Mood Check-in UI */
              <div id="chat-mood-checkin" className="flex-1 flex flex-col justify-center items-center p-6 text-center space-y-6 bg-[#FFF9EB]">
                <div className="space-y-2">
                  <Sparkles size={24} className="mx-auto text-[#200F07] animate-pulse" />
                  <h3 className="font-space font-bold text-sm text-[#200F07]">How are you feeling right now?</h3>
                  <p className="text-xs text-[#200F07]/60 font-dm font-bold">Choose a mood to customize Volt's productivity advice.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full">
                  {[
                    { label: "😤 Overwhelmed", value: "Overwhelmed" },
                    { label: "🎯 Focused", value: "Focused" },
                    { label: "😴 Tired", value: "Tired" },
                    { label: "💪 Motivated", value: "Motivated" }
                  ].map((m) => (
                    <button
                      key={m.value}
                      id={`button-mood-${m.value.toLowerCase()}`}
                      type="button"
                      onClick={() => {
                        setUserMood(m.value);
                        setShowMoodSelector(false);
                        
                        const feedbackMsg: ChatMessage = {
                          id: "mood-feedback-" + Date.now(),
                          sender: "clutch",
                          text: `Got it, switching to **${m.value}** mode.`,
                          createdAt: new Date().toISOString(),
                        };
                        setChatMessages((prev) => [...prev, feedbackMsg]);
                      }}
                      className="p-3 border border-[#C5E384] hover:border-[#200F07] rounded-lg text-xs font-dm text-[#200F07] hover:bg-[#C5E384]/15 transition-all cursor-pointer font-bold active:scale-95 text-left w-full bg-[#FFF9EB]"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* PART 5 & 6: Chat Interface */
              <>
                {/* Chat Messages area */}
                <div
                  id="chat-messages-area"
                  className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FFF9EB]"
                >
                  {chatMessages.map((msg) => {
                    const isUser = msg.sender === "user";
                    return (
                      <div
                        key={msg.id}
                        id={`chat-message-${msg.id}`}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`px-3.5 py-2.5 rounded-lg text-xs max-w-[85%] leading-relaxed break-words shadow-sm ${
                            isUser
                              ? "bg-[#C5E384]/20 border border-[#C5E384]/30 text-[#200F07] rounded-tr-none font-dm font-bold"
                              : "bg-[#FFF9EB] border border-[#C5E384] text-[#200F07] rounded-tl-none font-dm font-bold"
                          }`}
                        >
                          {isUser ? (
                            <p className="font-dm text-xs text-[#200F07] whitespace-pre-wrap font-bold">{msg.text}</p>
                          ) : (
                            <Markdown
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed font-dm text-xs text-[#200F07] font-bold">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1 text-xs text-[#200F07] font-dm font-bold">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1 text-xs text-[#200F07] font-dm font-bold">{children}</ol>,
                                li: ({ children }) => <li className="text-xs text-[#200F07] font-dm font-bold">{children}</li>,
                                strong: ({ children }) => <strong className="font-bold text-[#200F07] font-space">{children}</strong>,
                                code: ({ children }) => <code className="bg-[#C5E384]/15 px-1 py-0.5 rounded font-mono text-[11px] text-[#200F07] font-semibold">{children}</code>,
                              }}
                            >
                              {msg.text}
                            </Markdown>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Thinking Indicator */}
                  {isChatThinking && (
                    <div
                      id="chat-thinking-indicator"
                      className="flex justify-start animate-pulse"
                    >
                      <div className="bg-[#FFF9EB] border border-[#C5E384] text-[#200F07]/60 px-3.5 py-2.5 rounded-lg rounded-tl-none text-xs max-w-[85%] leading-relaxed flex items-center gap-1.5 shadow-sm font-dm font-bold italic">
                        <Sparkles size={12} className="animate-spin text-[#200F07]/50" />
                        <span>Volt is thinking...</span>
                      </div>
                    </div>
                  )}

                  {/* Chat Error */}
                  {chatError && (
                    <div
                      id="chat-error"
                      className="p-2 bg-red-50/50 border border-red-150 rounded text-red-600 text-[10px] font-dm font-bold text-center"
                    >
                      {chatError}
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input Area + Clickable Suggestion Chips (Below Text Input) */}
                <div id="chat-controls-area" className="p-3 border-t border-[#C5E384]/35 bg-[#FFF9EB] space-y-2">
                  <form
                    id="chat-form"
                    onSubmit={handleSendChatMessage}
                    className="flex gap-2 items-center"
                  >
                    <input
                      id="input-chat"
                      type="text"
                      required
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={isChatThinking}
                      placeholder="Ask Volt anything..."
                      className="flex-1 px-3 py-2 border border-[#C5E384] rounded text-xs bg-[#FFF9EB] text-[#200F07] placeholder:text-[#200F07]/40 focus:outline-none focus:border-[#200F07] font-dm font-bold disabled:opacity-50"
                    />
                    <button
                      id="button-send-chat"
                      type="submit"
                      disabled={!chatInput.trim() || isChatThinking}
                      className="p-2 bg-[#200F07] text-[#C5E384] rounded hover:bg-[#200F07]/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0 border-0"
                    >
                      <Send size={14} />
                    </button>
                  </form>

                  {/* PART 4: Suggested Question Chips */}
                  <div id="chat-suggested-chips" className="flex flex-wrap gap-1 pt-0.5">
                    {[
                      "What should I do right now?",
                      "Can I finish everything today?",
                      "What's my most critical task?",
                      "Focus plan for next 2 hours",
                      "Add a habit",
                      "Show my habits"
                    ].map((chipText, index) => (
                      <button
                        key={`suggested-chip-${index}`}
                        id={`suggested-chip-${index}`}
                        type="button"
                        disabled={isChatThinking}
                        onClick={() => sendChatMessage(chipText)}
                        className="px-2 py-1 bg-[#FFF9EB] hover:bg-[#C5E384]/15 border border-[#C5E384] rounded text-[10px] text-[#200F07]/75 font-dm font-bold cursor-pointer transition-colors hover:text-[#200F07] hover:border-[#200F07] disabled:opacity-50 disabled:cursor-not-allowed text-left"
                      >
                        {chipText}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
    </div>
  );
}

