import { useState } from 'react'
import { LESSONS, MODULES, findLesson } from '../lessons/curriculum'
import { useStore } from '../state/store'

export function LessonSidebar() {
  const currentLessonId = useStore((s) => s.currentLessonId)
  const completed = useStore((s) => s.completed)
  const mode = useStore((s) => s.mode)
  const loadLesson = useStore((s) => s.loadLesson)

  // explicit user toggles; the current lesson's module is open by default
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const currentModule = findLesson(currentLessonId)?.module

  return (
    <aside className="sidebar">
      <div className="sidebar-title">CURRICULUM</div>
      {MODULES.map((mod, mi) => {
        const done = mod.lessons.filter((l) => completed.includes(l.id)).length
        const isOpen = toggled[mod.name] ?? mod.name === currentModule
        return (
          <div key={mod.name} className="module">
            <button
              className="module-name"
              onClick={() => setToggled((t) => ({ ...t, [mod.name]: !isOpen }))}
            >
              <span className={`module-arrow ${isOpen ? 'open' : ''}`}>▸</span>
              <span className="module-label">
                {mi + 1} · {mod.name}
              </span>
              <span className={`module-count ${done === mod.lessons.length ? 'all-done' : ''}`}>
                {done}/{mod.lessons.length}
              </span>
            </button>
            {isOpen &&
              mod.lessons.map((l, i) => {
                const isDone = completed.includes(l.id)
                const active = mode === 'lesson' && l.id === currentLessonId
                return (
                  <button
                    key={l.id}
                    className={`lesson-item ${active ? 'active' : ''} ${isDone ? 'done' : ''}`}
                    onClick={() => loadLesson(l.id)}
                  >
                    <span className="lesson-num">{mi + 1}.{i + 1}</span>
                    <span className="lesson-title">
                      {l.title}
                      {l.drill && <span className="lesson-drill" title="Repeatable drill">↻</span>}
                    </span>
                    <span className="lesson-check">{isDone ? '✓' : ''}</span>
                  </button>
                )
              })}
          </div>
        )
      })}
      <div className="sidebar-progress">
        {completed.length} / {LESSONS.length} complete
      </div>
    </aside>
  )
}
