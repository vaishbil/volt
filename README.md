# Volt
### Your Last-Minute Life Saver

Volt is an AI-powered productivity companion built for people who work best under pressure. Unlike traditional task managers that passively remind you of deadlines, Volt proactively thinks, plans, and acts on your behalf — helping you make better decisions and complete tasks before deadlines are missed.

Built for the **Vibe2Ship Hackathon** (Coding Ninjas x Google for Developers)

---

## Live Demo
[https://volt-839071485135.asia-southeast1.run.app]

## Documentation
- [View Full Documentation (Google Doc)](https://docs.google.com/document/d/1GFiZiISXpf4or73bH9lXkrDvzn-KT61nESqlWv-YsGg/edit?usp=sharing)
- [PDF](https://github.com/vaishbil/volt/blob/main/Volt-vibe2ship-doc.pdf)

---

## Features

### Task Manager
- Add tasks with title, description, deadline, effort level and category
- AI-powered prioritization via Gemini — ranks tasks by urgency and effort
- Proactive risk alerts that fire automatically when deadlines are close
- Category filters, search, sort by deadline/AI rank
- Color tags, inline editing, natural language chat commands

### Habit & Goals Tracker
- Create daily/weekly habits with target duration and goal period
- Streak tracking with 30-day progress map
- Gemini-powered daily nudge personalized to your habits
- Add habits through natural language in Volt AI chat
- Drag and drop reorder, completion animations

### Day Planner
- Two-way Google Calendar sync
- Auto-fetches today's calendar events before generating plan
- Gemini creates realistic hour-by-hour schedule around your tasks, habits and calendar commitments
- Export generated plan back to Google Calendar with one click
- Includes habits in day plan when selected

### Lock In (Focus Room)
- Select a task or habit to focus on
- Pomodoro-style countdown timer with break sessions
- 9 immersive ambient backgrounds
- Web Audio API soundscape generator (rain, campfire, stream)
- Pinned vinyl-style music player with LoFi tracks
- Auto-marks task/habit as complete when session ends

### Volt AI Chat
- Mood check-in before chatting (Overwhelmed/Focused/Tired/Motivated)
- Mood-aware responses — Gemini adapts tone to your energy
- Full context of all tasks and habits
- Natural language commands:
  - "add task finish report deadline tomorrow"
  - "mark react lecture as done"
  - "add habit morning yoga 20 mins 30 days"
  - "delete office emails task"
- Conversation memory within session

### Scoreboard (Stats)
- Overall Volt Score combining task and habit progress
- Task completion rates by category
- Habit progress bar charts
- Weekly overview heatmap
- Shareable progress card

---

## Project Structure
 
```
clutch/
├── src/                        # React frontend source
├── server.ts                   # Express backend (API routes + Vite middleware)
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── firebase-applet-config.json # Firebase configuration
├── package.json
└── .gitignore
```

---

## Tech Stack

| Technology | Usage |
|------------|-------|
| React + Vite + TypeScript | Frontend framework |
| Tailwind CSS | Styling |
| Google Gemini API | All AI features |
| Google Calendar API | Two-way calendar sync |
| Firebase OAuth | Google authentication |
| Google Cloud Run | Deployment |
| Web Audio API | Ambient soundscapes |
| localStorage | Client-side data storage |
| Space Grotesk + DM Sans | Typography |
| Lucide React | Icons |

---

## Prerequisites
 
- [Node.js](https://nodejs.org/) (v18+ recommended)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A [Firebase](https://firebase.google.com/) project

---

## Deployment

This app is deployed on Google Cloud Run via Google AI Studio.

To deploy your own instance:
1. Open the project in [Google AI Studio](https://aistudio.google.com)
2. Click "Deploy" in the top right
3. Select your Google Cloud project
4. Click "Deploy App"
5. Your app will be live on a Cloud Run URL

---

## Open Source Credits

- [React](https://react.dev) — MIT License
- [Tailwind CSS](https://tailwindcss.com) — MIT License
- [Lucide React](https://lucide.dev) — ISC License
- [@google/genai](https://www.npmjs.com/package/@google/genai) — Apache 2.0
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) — SIL Open Font License
- [DM Sans](https://fonts.google.com/specimen/DM+Sans) — SIL Open Font License
- Royalty-free LoFi music — [SoundHelix](https://soundhelix.com)
- Ambient backgrounds — [Unsplash](https://unsplash.com)

---

## Built By

**Vaishali** — [@vaishbil](https://github.com/vaishbil)
