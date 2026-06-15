# Lift — Claude Code Rules

Inherits all rules from /Users/arnav/Documents/Arnav/Home/Tended Studio/CLAUDE.md. App-specific additions below.

## App
- **Name:** Lift (formerly Apex — repo/deploy still use apex name, UI says Lift)
- **Stack:** React + Vite + TypeScript + Tailwind
- **Accent color:** #3d7ab5 (weathered denim)
- **Deployed:** lift.tendedstudio.com (Vercel, project: apex-workout-app)
- **GitHub:** ArnavBansal361/apex-workout-app
- **Branch:** cursor/match-approved-design-mockups

## Supabase
- Project ID: pmhrdgfwujmusveebswj
- URL: https://pmhrdgfwujmusveebswj.supabase.co
- Tables: user_workout_data, leaderboard, trainer_codes, trainer_connections, trainer_notes, body_measurements, deload_weeks, tended_user_state, friendships
- Auth: email/password + Google OAuth — RLS on all tables

## Environment variables (all set in Vercel + .env)
- VITE_ANTHROPIC_API_KEY
- VITE_SUPABASE_URL=https://pmhrdgfwujmusveebswj.supabase.co
- VITE_SUPABASE_ANON_KEY=sb_publishable_pDsthbihok7nxgSkGUZuIw_qmDcqa77
- VITE_GOOGLE_CALENDAR_CLIENT_ID=580975288146-dl9kpd3r234c8cf5e95p2gaqscjoi2vl.apps.googleusercontent.com
- VITE_SPOTIFY_CLIENT_ID=99afc76107af4e3abb632efd8833ddeb

## AI
- Coach model: claude-opus-4-5 (most capable)
- AI Coach: data-first, answers as long as needed, no markdown, passes full athlete context
- All other AI (parser, templates, summaries): same model

## Structure
- 5 tabs (desktop sidebar): Today · Exercises · Schedule · Profile · Settings
- Mobile bottom nav: Today · Library · Plan · AI · Me
- /dashboard route for desktop (auto-redirects when width > 768px)
- iOS via Capacitor: ios/App/App.xcodeproj

## What's built and working
- Workout logging (sets, reps, weight), gym mode, rest timer
- Exercise library (300+ from wger), custom exercises, muscle group filter
- Weekly schedule, AI workout templates in Schedule tab
- AI coach chat (Opus, voice-to-text mic, TTS speaker toggle)
- AI workout parser (paste text → structured workout)
- PR celebrations, session summary modal
- Longevity score, Injury risk score (Low/Moderate/High)
- Top Lifts Progress card with sparklines + 4W/8W/All toggle
- Performance insights (needs 2+ weeks data — has proper empty state)
- Strength Age (renders in Me tab when bench/squat/deadlift PRs logged)
- Streak + streak shield, deload week auto-suggestion
- Body measurements, bodyweight chart
- Google Calendar sync, Spotify connect, Apple Health (iOS only)
- Trainer mode (trainer code, client connect, coach notes)
- Gym barcode (Settings)
- New user empty state on Today tab
- Password reset flow (forgot password + reset password)
- Google OAuth

## After every change — MANDATORY
1. Open lift.tendedstudio.com and verify the change looks correct
2. Check every other tab/page for regressions
3. Check on mobile viewport (narrow)
4. Flag anything off, broken, or improvable — even if unrelated to the task
5. Report what you saw, not just what you built

## Design violations to watch for in this app
- font-bold or font-semibold anywhere (weights must be 400/500 only)
- Hardcoded "Apex" text in UI (file/repo names are fine)
- Shadows (no box-shadow anywhere)
- Gradients (none)
- Pink colors (none)
- Card bg other than #13181f dark / #f5f9f7 light
- Border heavier than 0.5px
