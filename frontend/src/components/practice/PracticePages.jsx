import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

const languages = ['Python', 'Java', 'JavaScript', 'C++', 'C', 'SQL']

export function PracticePage({ page, token, progress, refreshProgress, setToast }) {
  const kind = page === 'aptitude' ? 'aptitude' : page === 'coding' ? 'coding' : 'interview'
  const [category, setCategory] = useState('')
  const [questions, setQuestions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedForQuery, setSelectedForQuery] = useState('')
  const [language, setLanguage] = useState('Python')
  const [answer, setAnswer] = useState('')
  const [choice, setChoice] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [aiConsent, setAiConsent] = useState(false)
  const [loadedForQuery, setLoadedForQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const categories = useMemo(() => {
    if (kind === 'aptitude') return (progress?.aptitude ?? []).map((item) => item.category).length
      ? progress.aptitude.map((item) => item.category)
      : ['Quantitative Aptitude']
    if (kind === 'interview') return (progress?.interview ?? []).map((item) => item.category).length
      ? progress.interview.map((item) => item.category)
      : ['HR', 'Programming', 'OOP', 'Data Structures', 'DBMS', 'Operating Systems', 'Computer Networks', 'AI/ML']
    return ['Easy', 'Medium', 'Hard']
  }, [kind, progress])

  const activeCategory = categories.includes(category) ? category : categories[0] ?? ''
  const queryKey = `${kind}:${activeCategory}:${kind === 'coding' ? language : ''}`
  const loading = Boolean(activeCategory) && loadedForQuery !== queryKey

  useEffect(() => {
    if (!activeCategory) return
    let active = true
    const query = new URLSearchParams({ kind, category: activeCategory })
    if (kind === 'coding') query.set('language', language)
    apiRequest(`/practice/questions?${query}`, { token })
      .then((items) => {
        if (active) {
          setQuestions(items)
          setLoadedForQuery(queryKey)
        }
      })
      .catch((error) => {
        if (active) {
          setToast(error.message)
          setQuestions([])
          setLoadedForQuery(queryKey)
        }
      })
    return () => {
      active = false
    }
  }, [token, kind, activeCategory, language, queryKey, setToast])

  const selectedQuestion = selectedForQuery === queryKey
    ? questions.find((item) => item.id === selectedId)
    : null
  const stats = kind === 'coding'
    ? progress?.coding
    : kind === 'aptitude'
      ? progress?.aptitude?.find((item) => item.category === activeCategory)
      : progress?.interview?.find((item) => item.category === activeCategory)

  const submitAnswer = async (event) => {
    event.preventDefault()
    if (!selectedQuestion) return
    setSubmitting(true)
    try {
      const result = await apiRequest('/practice/attempts', {
        method: 'POST',
        token,
        body: JSON.stringify({
          question_id: selectedQuestion.id,
          selected_answer: choice,
          answer_text: answer,
          language,
          ai_consent: aiConsent,
        }),
      })
      setFeedback(result)
      await refreshProgress()
      setToast(kind === 'coding' ? 'Practice marked as complete.' : 'Your practice result has been recorded.')
      if (kind !== 'aptitude') setQuestions((items) => items.map((item) => item.id === selectedQuestion.id
        ? { ...item, attempts: (item.attempts ?? 0) + 1, latest_score: result.score }
        : item))
    } catch (error) {
      setToast(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const title = kind === 'aptitude' ? 'Aptitude Practice' : kind === 'coding' ? 'Coding Practice' : 'Interview Preparation'

  return (
    <div className="page-panel">
      <div className="panel-header split-header">
        <div>
          <h2>{title}</h2>
          <p>Practice activity and scores shown here are from your account only.</p>
        </div>
      </div>
      {kind === 'coding' && <CodingSummary progress={progress?.coding} />}
      <div className="practice-toolbar">
        <label>
          {kind === 'coding' ? 'Difficulty' : kind === 'aptitude' ? 'Aptitude category' : 'Interview topic'}
          <select value={activeCategory} onChange={(event) => {
            setCategory(event.target.value)
            setSelectedForQuery('')
            setFeedback(null)
            setAiConsent(false)
          }}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        {kind !== 'aptitude' && (
          <label>
            Programming language
            <select value={language} onChange={(event) => {
              setLanguage(event.target.value)
              setSelectedForQuery('')
              setFeedback(null)
              setAiConsent(false)
            }}>
              {languages.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        )}
        {stats && (
          <div className="practice-category-stats">
            <strong>{kind === 'aptitude' ? stats.attempts : `${stats.completed}/${stats.available}`}</strong>
            <span>{kind === 'coding' ? 'problems self-marked practiced' : kind === 'aptitude' ? 'attempts recorded' : 'questions practiced'}</span>
            {kind === 'aptitude' && <span>Average score: {stats.average_score}%</span>}
            {kind === 'interview' && <span>Attempts recorded: {stats.attempts}</span>}
          </div>
        )}
      </div>
      {kind !== 'aptitude' && (
        <p className="practice-disclaimer">Question-bank examples are for practice; company tags are illustrative patterns, not verified or guaranteed questions from those employers.</p>
      )}
      {loading ? (
        <p className="loading-state">Loading practice questions…</p>
      ) : selectedQuestion ? (
        <QuestionSession
          kind={kind}
          question={selectedQuestion}
          language={language}
          answer={answer}
          setAnswer={setAnswer}
          choice={choice}
          setChoice={setChoice}
          feedback={feedback}
          aiConsent={aiConsent}
          setAiConsent={setAiConsent}
          submitting={submitting}
          onSubmit={submitAnswer}
          onBack={() => {
            setSelectedForQuery('')
            setFeedback(null)
            setAiConsent(false)
            setAnswer('')
            setChoice('')
          }}
        />
      ) : (
        <div className="question-grid">
          {questions.map((question) => (
            <article className="module-card question-card" key={question.id}>
              <div className="question-card-meta">
                <span className={`difficulty-badge difficulty-${question.difficulty.toLowerCase()}`}>{question.difficulty}</span>
                <span>{question.topic}</span>
              </div>
              <h3>{question.title}</h3>
              <p>{question.prompt}</p>
              <div className="question-card-footer">
                <span>{question.time_minutes} min{question.attempts > 0 ? ` · ${question.attempts} attempt${question.attempts > 1 ? 's' : ''}` : ''}</span>
                {question.company_tags?.length > 0 && <span>{question.company_tags.join(' · ')}</span>}
              </div>
              {question.attempts > 0 && <span className="completed-label">{kind === 'coding' ? 'Practiced by you' : `Last score: ${question.latest_score ?? 0}%`}</span>}
              <button type="button" className="primary-btn" onClick={() => {
                setSelectedId(question.id)
                setSelectedForQuery(queryKey)
                setFeedback(null)
                setAiConsent(false)
                setAnswer('')
                setChoice('')
              }}>{kind === 'aptitude' ? 'Start question' : kind === 'interview' ? 'Practice answer' : 'Open problem'}</button>
            </article>
          ))}
          {questions.length === 0 && <div className="empty-state"><h3>No questions available</h3><p>There are no questions for this category yet.</p></div>}
        </div>
      )}
    </div>
  )
}

function CodingSummary({ progress }) {
  const byDifficulty = progress?.by_difficulty ?? {}
  return (
    <div className="coding-summary">
      {['Easy', 'Medium', 'Hard'].map((difficulty) => (
        <div className="coding-count-card" key={difficulty}>
          <span className={`difficulty-badge difficulty-${difficulty.toLowerCase()}`}>{difficulty}</span>
          <strong>{byDifficulty[difficulty]?.available ?? 0}</strong>
          <span>available problems</span>
          <small>{byDifficulty[difficulty]?.completed ?? 0} marked practiced by you</small>
        </div>
      ))}
      <div className="coding-count-card coding-total-card">
        <span>Total problem bank</span>
        <strong>{progress?.available ?? 0}</strong>
        <small>{progress?.completed ?? 0} practiced by you</small>
      </div>
    </div>
  )
}

function QuestionSession({
  kind,
  question,
  language,
  answer,
  setAnswer,
  choice,
  setChoice,
  feedback,
  aiConsent,
  setAiConsent,
  submitting,
  onSubmit,
  onBack,
}) {
  const isAptitude = kind === 'aptitude'
  const isCoding = kind === 'coding'
  return (
    <section className={`question-session${isCoding ? ' coding-question-session' : ''}`}>
      <button type="button" className="text-button" onClick={onBack}>← Back to questions</button>
      <div className="question-session-header">
        <span className={`difficulty-badge difficulty-${question.difficulty.toLowerCase()}`}>{question.difficulty}</span>
        <span>{question.topic}</span>
        <span>{question.time_minutes} minutes</span>
        {!isAptitude && <span>{language}</span>}
      </div>
      <h3 className={isCoding ? 'coding-question-title' : undefined}>{question.title}</h3>
      <p className={`question-prompt${isCoding ? ' coding-question-prompt' : ''}`}>{question.prompt}</p>
      {isAptitude ? (
        <form onSubmit={onSubmit}>
          <fieldset className="answer-choices">
            <legend>Choose your answer</legend>
            {Object.entries(question.choices ?? {}).map(([key, value]) => (
              <label className={`answer-choice${choice === key ? ' selected' : ''}`} key={key}>
                <input type="radio" name="answer" value={key} checked={choice === key} onChange={() => setChoice(key)} disabled={Boolean(feedback)} />
                <strong>{key}</strong><span>{value}</span>
              </label>
            ))}
          </fieldset>
          {!feedback && <button type="submit" className="primary-btn" disabled={!choice || submitting}>{submitting ? 'Checking…' : 'Submit answer'}</button>}
        </form>
      ) : (
        <form className="practice-answer-form" onSubmit={onSubmit}>
          {isCoding ? (
            <>
              <div className="coding-problem-details" aria-label="Problem details">
                <section className="coding-problem-section">
                  <h4>Sample input</h4>
                  <pre><code>{question.sample_input}</code></pre>
                </section>
                <section className="coding-problem-section">
                  <h4>Sample output</h4>
                  <pre><code>{question.sample_output}</code></pre>
                </section>
                <section className="coding-problem-section coding-constraints">
                  <h4>Constraints</h4>
                  <pre><code>{question.constraints}</code></pre>
                </section>
                <details className="coding-hint">
                  <summary>Show hint</summary>
                  <p>{question.hint}</p>
                </details>
              </div>
              <label>
                Your {language} solution or approach
                <textarea rows="12" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={Boolean(feedback)} placeholder={`Write your ${language} solution here.`} />
              </label>
              <p className="practice-disclaimer">Practice-only mode: CareerForge saves the solution you submit and counts the problem as practiced. It does not execute or judge code.</p>
            </>
          ) : (
            <>
              <label>
                Your interview answer
                <textarea rows="7" value={answer} onChange={(event) => {
                  setAnswer(event.target.value)
                  setAiConsent(false)
                }} disabled={Boolean(feedback) || submitting} placeholder={`Answer in ${language} if appropriate. Use a specific example and explain the result.`} />
              </label>
              <label className="consent-checkbox">
                <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} disabled={Boolean(feedback) || submitting} />
                <span>I agree to save this answer in my CareerForge practice history and send the written question and answer to Google Gemini for AI-generated feedback. Do not include sensitive personal information; Google&apos;s provider policies apply.</span>
              </label>
            </>
          )}
          {!feedback && <button type="submit" className="primary-btn" disabled={answer.trim().length < 20 || submitting || (!isCoding && !aiConsent)}>{submitting ? 'Saving…' : isCoding ? 'Save practice as completed' : 'Submit answer for feedback'}</button>}
        </form>
      )}
      {feedback && <FeedbackResult kind={kind} result={feedback} />}
    </section>
  )
}

function FeedbackResult({ kind, result }) {
  if (kind === 'aptitude') {
    return (
      <div className={`practice-feedback ${result.feedback.correct ? 'feedback-success' : 'feedback-review'}`} role="status">
        <strong>{result.feedback.correct ? 'Correct — 100%' : 'Not quite — 0%'}</strong>
        <p>Correct answer: {result.feedback.correct_answer}</p>
        <p>{result.feedback.explanation}</p>
      </div>
    )
  }
  if (kind === 'coding') {
    return <div className="practice-feedback feedback-review" role="status"><strong>Practice recorded</strong><p>{result.feedback.note}</p></div>
  }
  const feedback = result.feedback
  return (
    <div className="practice-feedback">
      <div className="feedback-header">
        <div><span>Overall practice score</span><strong>{feedback.overall_score}%</strong></div>
        <div className="feedback-score-grid">
          {[
            ['Relevance', feedback.relevance],
            ['Clarity', feedback.clarity],
            ['Specificity', feedback.specificity],
          ].map(([label, score]) => <div key={label}><span>{label}</span><strong>{score}%</strong></div>)}
        </div>
      </div>
      {feedback.strengths.length > 0 && <p><strong>Strengths:</strong> {feedback.strengths.join(' · ')}</p>}
      <p><strong>Try next:</strong> {feedback.areas_to_improve.join(' ')}</p>
      <small>{feedback.scoring_note}</small>
    </div>
  )
}

export function SkillAssessmentPage({ progress }) {
  const colors = ['#7c3aed', '#10b981', '#f59e0b', '#ef4444']
  return (
    <div className="page-panel">
      <div className="panel-header">
        <div>
          <h2>Skill Assessment</h2>
          <p>Scores use your completed aptitude and interview practice. No activity means 0%—there are no pre-filled results.</p>
        </div>
      </div>
      <div className="skill-grid">
        {(progress?.skills ?? []).map((skill, index) => (
          <div key={skill.label} className="skill-card">
            <div className="progress-label-row"><span>{skill.label}</span><span>{skill.score}%</span></div>
            <div className="progress-bar"><span style={{ width: `${skill.score}%`, background: colors[index] }} /></div>
            <p>{skill.attempts > 0 ? `Based on ${skill.attempts} completed scored practice ${skill.attempts === 1 ? 'attempt' : 'attempts'}.` : 'No scored practice yet. Complete a practice activity to earn a score.'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
