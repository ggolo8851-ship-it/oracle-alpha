# Calculation architecture
- Keep arithmetic and scenario math in browser-safe pure modules, with regression tests; never evaluate user input as code.
- Preserve observed price chronology when measuring risk; modeled confidence and signal agreement are heuristics, not verified forecast accuracy.
- Keep Bun regression tests under tests/ outside the application TypeScript graph so test-only runtime imports never enter the Worker bundle.