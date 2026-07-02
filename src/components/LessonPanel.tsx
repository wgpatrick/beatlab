import { findLesson, nextLessonId, resolveDyn } from '../lessons/curriculum'
import { scoreSummary, type ScoreMap } from '../lessons/framework'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'

function starString(scores: ScoreMap) {
  const { stars } = scoreSummary(scores)
  return ' ' + '★'.repeat(stars) + '☆'.repeat(3 - stars)
}

export function LessonPanel() {
  const mode = useStore((s) => s.mode)
  const currentLessonId = useStore((s) => s.currentLessonId)
  const lessonParams = useStore((s) => s.lessonParams)
  const feedback = useStore((s) => s.feedback)
  const paramScores = useStore((s) => s.paramScores)
  const completed = useStore((s) => s.completed)
  const bpm = useStore((s) => s.bpm)
  const check = useStore((s) => s.check)
  const nextLesson = useStore((s) => s.nextLesson)
  const loadLesson = useStore((s) => s.loadLesson)

  if (mode === 'sandbox') {
    return (
      <aside className="lesson-panel">
        <div className="lesson-module">SANDBOX</div>
        <h2>Free Session</h2>
        <p className="lesson-summary">
          No rules here — this is your studio. Program drums, write basslines, stack chords, design
          sounds. A four-track groove is loaded to mangle, or hit Clear and start from silence.
        </p>
        <div className="task-box">
          Try combining what you've learned: a four-on-the-floor beat, a root-note bassline in A
          minor, pad chords, and a pluck lead.
        </div>
      </aside>
    )
  }

  const lesson = findLesson(currentLessonId)
  if (!lesson) return null
  const isDone = completed.includes(lesson.id)
  const hasNext = nextLessonId(lesson.id) !== null
  const task = resolveDyn(lesson.task, lessonParams)

  return (
    <aside className="lesson-panel">
      <div className="lesson-module">
        {lesson.module.toUpperCase()}
        {lesson.drill && <span className="drill-badge">DRILL</span>}
      </div>
      <h2>
        {lesson.title} {isDone && <span className="done-badge">✓</span>}
      </h2>
      <p className="lesson-summary">{lesson.summary}</p>
      <div className="task-box">
        <div className="task-label">YOUR TASK</div>
        {task}
      </div>
      {lesson.target && (
        <button
          className="target-btn"
          onClick={() => void engine.playTarget(resolveDyn(lesson.target!, lessonParams))}
        >
          ◉ Play Target Sound
        </button>
      )}
      {lesson.drumTarget && (
        <button
          className="target-btn"
          onClick={() => void engine.playTargetDrums(resolveDyn(lesson.drumTarget!, lessonParams), bpm)}
        >
          ◉ Play Target Beat
        </button>
      )}
      {lesson.drill && (
        <button className="reroll-btn" onClick={() => loadLesson(lesson.id)}>
          ↻ New Exercise
        </button>
      )}
      <details className="hints">
        <summary>Hints ({lesson.hints.length})</summary>
        <ul>
          {lesson.hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </details>
      <button className="check-btn" onClick={check}>
        Check My Work
      </button>
      {feedback && (
        <div className={`feedback ${feedback.pass ? 'pass' : 'fail'}`}>
          <div className="feedback-head">
            {feedback.pass ? '✓ Passed' : '✕ Not yet'}
            {paramScores && <span className="stars">{starString(paramScores)}</span>}
          </div>
          {feedback.message}
        </div>
      )}
      {feedback?.pass && hasNext && (
        <button className="next-btn" onClick={nextLesson}>
          Next Lesson →
        </button>
      )}
      {feedback?.pass && !hasNext && (
        <div className="course-done">🎉 Curriculum complete — the Sandbox is yours.</div>
      )}
    </aside>
  )
}
