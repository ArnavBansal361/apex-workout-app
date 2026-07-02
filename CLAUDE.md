# Lift — Claude Code Rules

Inherits all rules from /Users/arnav/Documents/Arnav/Home/Tended Studio/CLAUDE.md.

## App
- **Name:** Lift (formerly Apex — repo/deploy still use apex name, UI says Lift)
- **Stack:** React + Vite + TypeScript + Tailwind
- **Accent color:** #c0582a (burnt sienna)
- **Deployed:** lift.tendedstudio.com (Vercel, project: apex-workout-app)
- **GitHub:** ArnavBansal361/apex-workout-app, branch: main

## Supabase
- Project ID: pmhrdgfwujmusveebswj
- URL: https://pmhrdgfwujmusveebswj.supabase.co
- Tables: user_workout_data, leaderboard, trainer_codes, trainer_connections, trainer_notes, body_measurements, deload_weeks, tended_user_state, friendships
- Auth: email/password + Google OAuth — RLS on all tables

## Environment variables
- VITE_ANTHROPIC_API_KEY
- VITE_SUPABASE_URL=https://pmhrdgfwujmusveebswj.supabase.co
- VITE_SUPABASE_ANON_KEY=sb_publishable_pDsthbihok7nxgSkGUZuIw_qmDcqa77
- VITE_GOOGLE_CALENDAR_CLIENT_ID=580975288146-dl9kpd3r234c8cf5e95p2gaqscjoi2vl.apps.googleusercontent.com
- VITE_SPOTIFY_CLIENT_ID=99afc76107af4e3abb632efd8833ddeb

## AI
- Coach chat: claude-sonnet-4-6 (prompt caching on system prompt)
- Workout parser + AI templates: claude-sonnet-4-6
- Motivation, weekly insight, session summary, form tips: zero-cost local logic — no AI calls
- Never use Opus — too expensive
- AI Coach voice: data-first, no markdown, passes full athlete context

## Pre-TestFlight Checklist
**At the start of every session, print this checklist with current status before any other work.**

- [ ] AI coach API key moved to Supabase Edge Function — must NOT ship in iOS JS bundle
- [ ] Privacy policy live at lift.tendedstudio.com/privacy.html
- [ ] Open Graph tags on lift.tendedstudio.com (og:title, og:description, og:image)
- [ ] com.arnav.lift registered in App Store Connect
- [ ] Xcode widget signing team set in Signing & Capabilities
- [ ] App Store metadata written: description, keywords, screenshots
- [ ] No hardcoded "Apex" in any user-facing UI string

Check each item by inspecting the actual code/live URL, not from memory. If any are incomplete, flag them before starting feature work.

## Before implementing any feature
1. Check if it already exists somewhere in the app — say so if it does.
2. Check if a similar feature exists elsewhere that could be extended — point to it first.
3. Only then implement from scratch.

## CLAUDE.md updates
When Arnav corrects a mistake, add a rule here immediately. Treat this as a living doc.

## Structure
- Mobile bottom nav: Today · Library · Plan · AI · Me
- Desktop: /dashboard route (auto-redirects when width > 768px), sidebar layout
- iOS via Capacitor: ios/App/App.xcodeproj

## After every change — MANDATORY
1. Open lift.tendedstudio.com and verify the change looks correct
2. Check every other tab/page for regressions
3. Check on mobile viewport (375px — iPhone SE is the minimum)
4. Flag anything off, broken, or improvable — even if unrelated to the task

## Design violations to watch for in this app
- Hardcoded "Apex" text in UI (file/repo names are fine)
- Shadows (no box-shadow anywhere)
- Pink colors (none)
- Card bg other than #13181f dark / #f5f9f7 light
- Border heavier than 0.5px
- Font weight 600/700 and gradients are acceptable if they look good
