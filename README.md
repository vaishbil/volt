# Volt
### Your Last-Minute Life Saver

## About The Project

Most productivity tools remind you that something is due — and stop there. Volt goes further. It's an AI-powered companion that prioritizes your tasks, plans your day around your real calendar, tracks your habits, and takes action on your behalf — built for the moments when deadlines are close and you need more than a notification.

Built for the **Vibe2Ship Hackathon** (Coding Ninjas x Google for Developers)

---

## Live Demo
[https://volt-839071485135.asia-southeast1.run.app]

## Documentation
- [View Full Documentation (Google Doc)](https://docs.google.com/document/d/1GFiZiISXpf4or73bH9lXkrDvzn-KT61nESqlWv-YsGg/edit?usp=sharing)
- [Volt Doc](https://github.com/vaishbil/volt/blob/main/volt-vibe2ship.pdf)

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
volt/
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

**Frontend**
React 19 · TypeScript 5.8 · Vite 6 · Tailwind CSS 4

**AI & Backend**
Google Gemini API (@google/genai) · Node.js · Express.js

**Animation & Interaction**
Framer Motion · dnd-kit · Canvas Confetti

**Audio**
Web Audio API · HTML5 Audio

**Data & Auth**
localStorage (offline-first) · Firebase Authentication

**Deployment**
Google Cloud Run · Google AI Studio

---

## Google Technologies Used

| Technology | Purpose |
|------------|---------|
| Gemini API | Task prioritization, day planning, chat assistant, habit nudges |
| Google Calendar API | Two-way calendar sync and event export |
| Firebase Authentication | Secure Google OAuth for Calendar access |
| Google AI Studio | Development and deployment platform |
| Google Cloud Run | Production hosting |
| Google Fonts | Space Grotesk, DM Sans typography |

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

## Author

**Vaishali Wankhede** — [@vaishbil](https://github.com/vaishbil)

Built for Vibe2Ship 2026