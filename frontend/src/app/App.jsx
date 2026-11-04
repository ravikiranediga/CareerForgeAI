import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../services/api'
import { useAuth } from '../contexts/useAuth'
import AuthPage from '../components/auth/AuthPage'
import { PracticePage, SkillAssessmentPage } from '../components/practice/PracticePages'
import { ProfilePage, ResumeBuilderPage, ResumeOnboarding } from '../components/resume/ResumePages'
import { useTheme } from '../contexts/useTheme'
import './App.css'

const navItems = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'jobs', label: 'Find Jobs', icon: '🔎' },
  { id: 'applications', label: 'Applications', icon: '📄' },
  { id: 'aptitude', label: 'Aptitude', icon: '🧠' },
  { id: 'coding', label: 'Coding Practice', icon: '💻' },
  { id: 'interview', label: 'Interview Preparation', icon: '🎤' },
  { id: 'resume', label: 'Resume Builder', icon: '📝' },
  { id: 'skills', label: 'Skill Assessment', icon: '📊' },
  { id: 'learning', label: 'Learning', icon: '📚' },
  { id: 'saved', label: 'Saved Jobs', icon: '🔖' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

const quickActions = [
  { title: 'Find Jobs', description: 'Explore curated openings', icon: '💼' },
  { title: 'Practice Aptitude', description: 'Sharpen speed and accuracy', icon: '🧮' },
  { title: 'Solve Coding Problems', description: 'Build your engineering edge', icon: '🧩' },
  { title: 'Prepare for Interview', description: 'Practice mock rounds', icon: '🎯' },
  { title: 'Build Resume', description: 'Craft standout applications', icon: '📄' },
  { title: 'Take Skill Test', description: 'Measure your readiness', icon: '✅' },
]

const pageIds = new Set(navItems.map((item) => item.id))

function normalizeSearchText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function jobMatchesSearch(job, query) {
  const normalizedQuery = normalizeSearchText(query)
  const searchableText = normalizeSearchText(
    `${job.title} ${job.company} ${(job.skills ?? []).join(' ')} ${job.description ?? ''}`,
  )
  const paddedText = ` ${searchableText} `
  const terms = [normalizedQuery]
  if (/\b(ai|ml|aiml|machine learning|artificial intelligence)\b/.test(normalizedQuery)) {
    terms.push(
      'ai',
      'ai engineer',
      'ml',
      'ml engineer',
      'aiml',
      'machine learning',
      'machine learning engineer',
      'artificial intelligence',
    )
  }
  return terms.some((term) => term && paddedText.includes(` ${normalizeSearchText(term)} `))
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/:page" element={<ProtectedDashboard />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function ProtectedDashboard() {
  const { page } = useParams()
  const { user, token, loading, refreshUser } = useAuth()
  const [resumeNotice, setResumeNotice] = useState('')

  if (loading) return <div className="auth-loading">Loading your workspace…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.has_resume && page !== 'onboarding') return <Navigate to="/onboarding" replace />
  if (user.has_resume && page === 'onboarding') return <Navigate to="/dashboard" replace />
  if (page === 'onboarding') {
    return <ResumeOnboarding
      token={token}
      onUploaded={async (profile) => {
        setResumeNotice(profile.analysis_notice ?? '')
        await refreshUser()
      }}
    />
  }
  if (!pageIds.has(page)) return <Navigate to="/dashboard" replace />

  return <DashboardLayout activePage={page} resumeNotice={resumeNotice} />
}

function DashboardLayout({ activePage, resumeNotice }) {
  const navigate = useNavigate()
  const { token, user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [externalSharingConfirmed, setExternalSharingConfirmed] = useState(false)
  const [applicationStarted, setApplicationStarted] = useState(null)
  const [submittingApplication, setSubmittingApplication] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [jobs, setJobs] = useState([])
  const [savedJobs, setSavedJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [profile, setProfile] = useState(null)
  const [practiceProgress, setPracticeProgress] = useState(null)
  const [completedDataRequest, setCompletedDataRequest] = useState(null)
  const [jobFeedError, setJobFeedError] = useState('')
  const [jobRetry, setJobRetry] = useState(0)
  const dataLoading = completedDataRequest?.token !== token || completedDataRequest?.jobRetry !== jobRetry
  const [jobFilters, setJobFilters] = useState({
    location: 'All',
    experience: 'All',
    workMode: 'All',
    type: 'All',
  })
  const [toast, setToast] = useState('')

  const navigatePage = (page) => {
    navigate(`/${page}`)
    setSidebarOpen(false)
  }

  const openJob = (job) => {
    setSelectedJob(job)
    setSelectedResumeId(String(profile?.resume?.id ?? profile?.resumes?.[0]?.id ?? ''))
    setExternalSharingConfirmed(false)
    setApplicationStarted(null)
  }

  useEffect(() => {
    if (!toast) return undefined

    const timeout = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    let active = true
    setJobFeedError('')
    Promise.allSettled([
      apiRequest('/jobs'),
      apiRequest('/applications', { token }),
      apiRequest('/saved-jobs', { token }),
      apiRequest('/profile', { token }),
      apiRequest('/practice/progress', { token }),
    ])
      .then(([jobResult, applicationResult, savedResult, profileResult, progressResult]) => {
        if (!active) return
        if (jobResult.status === 'fulfilled') {
          setJobs(jobResult.value)
          setJobFeedError(jobResult.value[0]?.sourceWarning ?? '')
        } else {
          setJobs([])
          setJobFeedError(jobResult.reason.message)
        }
        const failures = []
        if (applicationResult.status === 'fulfilled') setApplications(applicationResult.value)
        else failures.push(applicationResult.reason.message)
        if (savedResult.status === 'fulfilled') setSavedJobs(savedResult.value)
        else failures.push(savedResult.reason.message)
        if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
        else failures.push(profileResult.reason.message)
        if (progressResult.status === 'fulfilled') setPracticeProgress(progressResult.value)
        else failures.push(progressResult.reason.message)
        if (failures.length) setToast(failures.join(' '))
      })
      .finally(() => {
        if (active) setCompletedDataRequest({ token, jobRetry })
      })

    return () => {
      active = false
    }
  }, [token, jobRetry])

  const refreshProgress = async () => {
    const result = await apiRequest('/practice/progress', { token })
    setPracticeProgress(result)
    return result
  }

  const progressMetrics = [
    { label: 'Profile completion', value: profile?.profile_completion ?? 0 },
    { label: 'Resume section coverage', value: profile?.resume?.section_coverage ?? 0 },
    { label: 'Aptitude score', value: practiceProgress?.skills?.find((skill) => skill.label === 'Aptitude')?.score ?? 0 },
    {
      label: 'Coding problems practiced',
      value: practiceProgress?.coding?.available
        ? Math.round((practiceProgress.coding.completed / practiceProgress.coding.available) * 100)
        : 0,
    },
    {
      label: 'Interview questions practiced',
      value: practiceProgress?.interview?.length
        ? Math.round((practiceProgress.interview.reduce((sum, item) => sum + item.completed, 0) /
          practiceProgress.interview.reduce((sum, item) => sum + item.available, 0)) * 100)
        : 0,
    },
  ]

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesQuery = searchValue.trim() === '' || jobMatchesSearch(job, searchValue)

      const normalizedLocation = normalizeSearchText(jobFilters.location)
      const jobLocation = normalizeSearchText(job.location)
      const matchesLocation = jobFilters.location === 'All'
        || jobLocation.includes(normalizedLocation)
        || (normalizedLocation.includes('bangalore') && jobLocation.includes('bengaluru'))
        || (normalizedLocation.includes('bengaluru') && jobLocation.includes('bangalore'))
      const matchesExperience =
        jobFilters.experience === 'All' || job.experience === jobFilters.experience
      const matchesMode = jobFilters.workMode === 'All' || job.workMode === jobFilters.workMode
      const matchesType = jobFilters.type === 'All' || job.type === jobFilters.type
      return matchesQuery && matchesLocation && matchesExperience && matchesMode && matchesType
    })
  }, [jobs, searchValue, jobFilters])
  const jobFilterOptions = useMemo(() => ({
    location: ['Bengaluru', 'Hyderabad', 'Chennai'],
    experience: [...new Set(jobs.map((job) => job.experience).filter(Boolean))].sort(),
    workMode: [...new Set(jobs.map((job) => job.workMode).filter(Boolean))].sort(),
    type: [...new Set(jobs.map((job) => job.type).filter(Boolean))].sort(),
  }), [jobs])

  const handleApply = async (event) => {
    event.preventDefault()
    if (!selectedJob || !selectedResumeId || !externalSharingConfirmed) {
      setToast('Select a resume and confirm before continuing to the employer site.')
      return
    }
    setSubmittingApplication(true)
    try {
      const newApplication = await apiRequest('/applications', {
        method: 'POST',
        token,
        body: JSON.stringify({
          job_id: selectedJob.id,
          resume_id: Number(selectedResumeId),
          confirmed_external_sharing: externalSharingConfirmed,
        }),
      })
      setApplications((previous) => [newApplication, ...previous])
      setApplicationStarted(newApplication)
      setToast(`Tracking started for ${selectedJob.title}. The employer has not received an application.`)
    } catch (error) {
      setToast(error.message)
    } finally {
      setSubmittingApplication(false)
    }
  }

  const updateApplicationStatus = async (application, status) => {
    try {
      const updated = await apiRequest(`/applications/${application.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      })
      setApplications((previous) => previous.map((item) => item.id === updated.id ? updated : item))
      setToast(`Application moved to ${status}.`)
    } catch (error) {
      setToast(error.message)
    }
  }

  const toggleSavedJob = async (job) => {
    const alreadySaved = savedJobs.some((savedJob) => savedJob.id === job.id)
    try {
      if (alreadySaved) {
        await apiRequest(`/saved-jobs/${job.id}`, { method: 'DELETE', token })
        setSavedJobs((previous) => previous.filter((savedJob) => savedJob.id !== job.id))
        setToast('Job removed from saved jobs.')
      } else {
        await apiRequest(`/saved-jobs/${job.id}`, { method: 'POST', token })
        setSavedJobs((previous) => [{ ...job, saved: 'Today' }, ...previous])
        setToast('Job saved for later.')
      }
    } catch (error) {
      setToast(error.message)
    }
  }

  const renderDashboard = () => (
    <>
      <section className="welcome-panel">
        <div>
          <p className="eyebrow">CareerForge</p>
          <h1>Good Morning, {user.name.split(' ')[0]} 👋</h1>
          <p className="subtext">Build your skills, find the right opportunities, and prepare for your next career step.</p>
          <div className="profile-progress-row">
            <span>Profile {profile?.profile_completion ?? 0}% complete</span>
            <button type="button" className="primary-btn" onClick={() => navigatePage('profile')}>Complete Profile</button>
          </div>
        </div>
        <div className="welcome-card">
          <div className="avatar-ring">
            <span>{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <strong>Profile completeness</strong>
            <div className="progress-bar small"><span style={{ width: `${profile?.profile_completion ?? 0}%` }} /></div>
            <small>{profile?.profile_completion ?? 0}% of profile details found</small>
          </div>
        </div>
      </section>

      <section className="job-search card-panel">
        <div className="panel-header">
          <h2>Find Your Next Opportunity</h2>
        </div>
        <div className="job-form-grid">
          <label>
            Job title / skill
            <input type="text" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
          </label>
          <label>
            Location
            <input
              type="text"
              value={jobFilters.location === 'All' ? '' : jobFilters.location}
              placeholder="Any location"
              onChange={(event) => setJobFilters({ ...jobFilters, location: event.target.value || 'All' })}
            />
          </label>
          <label>
            Experience
            <select value={jobFilters.experience} onChange={(event) => setJobFilters({ ...jobFilters, experience: event.target.value })}>
              <option>All</option>
              {jobFilterOptions.experience.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Work mode
            <select value={jobFilters.workMode} onChange={(event) => setJobFilters({ ...jobFilters, workMode: event.target.value })}>
              <option>All</option>
              {jobFilterOptions.workMode.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Job type
            <select value={jobFilters.type} onChange={(event) => setJobFilters({ ...jobFilters, type: event.target.value })}>
              <option>All</option>
              {jobFilterOptions.type.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" className="primary-btn search-btn" onClick={() => {
            setSearchValue(jobTitle)
            navigatePage('jobs')
          }}>Search Jobs</button>
        </div>
        <p className="source-note">Live Adzuna listings from up to 30 employers in Bengaluru, Hyderabad, and Chennai within 50 km; openings link to their original postings.</p>
        {jobFeedError && (
          <p className="error-message" role="status">
            Job feed notice: {jobFeedError}
            <button type="button" className="secondary-btn" onClick={() => setJobRetry((value) => value + 1)}>Retry</button>
          </p>
        )}
        <div className="tag-row">
          {['Software Developer', 'Data Analyst', 'AI/ML Engineer', 'Web Developer', 'Java Developer', 'Python Developer'].map((item) => (
            <button key={item} type="button" className="chip-btn" onClick={() => {
              setJobTitle(item)
              setSearchValue(item)
              navigatePage('jobs')
            }}>{item}</button>
          ))}
        </div>
      </section>

      <section className="quick-actions-block">
        <div className="panel-header">
          <h2>Quick Actions</h2>
        </div>
        <div className="quick-grid">
          {quickActions.map((action) => (
            <button key={action.title} type="button" className="quick-card" onClick={() => navigatePage(action.title.includes('Jobs') ? 'jobs' : action.title.includes('Aptitude') ? 'aptitude' : action.title.includes('Coding') ? 'coding' : action.title.includes('Interview') ? 'interview' : action.title.includes('Resume') ? 'resume' : 'skills')}>
              <span className="quick-icon">{action.icon}</span>
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-header split-header">
          <h2>Job Listings</h2>
          <div className="filter-row">
            {['Relevance', 'Latest', 'Salary', 'Location', 'Experience'].map((filter) => (
              <button key={filter} type="button" className="small-btn">{filter}</button>
            ))}
          </div>
        </div>
        <div className="job-grid">
          {dataLoading && <p className="loading-state">Loading recommended jobs…</p>}
          {jobs.slice(0, 3).map((job) => (
            <article key={job.id} className="job-card">
              <div className="card-topline">
                <div className="company-mark" style={{ background: job.color }}>{job.company.charAt(0)}</div>
                <button type="button" className="icon-btn" aria-label={savedJobs.some((savedJob) => savedJob.id === job.id) ? 'Remove saved job' : 'Save job'} onClick={() => toggleSavedJob(job)}>{savedJobs.some((savedJob) => savedJob.id === job.id) ? '★' : '☆'}</button>
              </div>
              <h3>{job.title}</h3>
              <p>{job.company}</p>
              <small>Source: {job.sourceName}</small>
              <div className="meta-row">
                <span>{job.location}</span>
                <span>{job.workMode}</span>
              </div>
              <div className="meta-row small-meta">
                <span>{job.experience}</span>
                <span>{job.salary}</span>
              </div>
              <div className="skill-tags">
                {job.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <div className="card-actions">
                <span>{job.posted}</span>
                <a href={job.jobUrl} target="_blank" rel="noreferrer">Original listing</a>
                <button type="button" className="secondary-btn" onClick={() => openJob(job)}>View Details</button>
                <button type="button" className="primary-btn" onClick={() => openJob(job)}>Apply Now</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="analytics-grid">
        <div className="card-panel large-panel">
          <div className="panel-header">
            <h2>My Applications</h2>
          </div>
          <div className="stats-grid">
            {[
              { label: 'Tracked', value: applications.length },
              { label: 'Ready to apply', value: applications.filter((item) => item.status === 'Ready to apply').length },
              { label: 'Shortlisted', value: applications.filter((item) => ['Screening', 'Assessment'].includes(item.status)).length },
              { label: 'Interviews', value: applications.filter((item) => item.status === 'Interview').length },
              { label: 'Offers', value: applications.filter((item) => item.status === 'Offer').length },
            ].map((stat) => (
              <div key={stat.label} className="stat-box">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="pipeline">
            {['Ready to apply', 'Applied', 'Screening', 'Assessment', 'Interview', 'Offer'].map((step) => (
              <div key={step} className={`pipeline-step ${applications.some((item) => item.status === step) ? 'active' : ''}`}>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-panel">
          <div className="panel-header">
            <h2>Career Progress</h2>
          </div>
          <div className="progress-list">
            {progressMetrics.map((item) => (
              <div key={item.label}>
                <div className="progress-label-row"><span>{item.label}</span><span>{item.value}%</span></div>
                <div className="progress-bar"><span style={{ width: `${item.value}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="card-panel">
          <div className="panel-header">
            <h2>Upcoming Tests</h2>
          </div>
          <p className="empty-panel-copy">No upcoming tests are scheduled.</p>
        </div>
        <div className="card-panel">
          <div className="panel-header">
            <h2>Notifications</h2>
          </div>
          <p className="empty-panel-copy">You’re all caught up. New account notifications will appear here.</p>
        </div>
        <div className="card-panel">
          <div className="panel-header">
            <h2>Recent Activity</h2>
          </div>
          {(() => {
            const records = [
              ...(practiceProgress?.recent_activity ?? []).map((item) => ({
                id: `practice-${item.completed_at}`,
                text: `${item.kind === 'aptitude' ? 'Aptitude' : item.kind === 'coding' ? 'Coding' : 'Interview'} practice · ${item.category}${item.score === null ? '' : ` · ${item.score}%`}`,
                date: item.completed_at,
              })),
              ...applications.map((item) => ({
                id: `application-${item.id}`,
                text: `${item.status === 'Ready to apply' ? 'Prepared application for' : 'Applied to'} ${item.role} at ${item.company}`,
                date: item.date,
              })),
            ].sort((first, second) => Date.parse(second.date) - Date.parse(first.date)).slice(0, 5)
            return records.length
              ? <ul className="mini-list">{records.map((item) => <li key={item.id}><span className="dot gold" />{item.text}<small>{Number.isNaN(Date.parse(item.date)) ? item.date : new Date(item.date).toLocaleDateString()}</small></li>)}</ul>
              : <p className="empty-panel-copy">Your completed practice and job applications will appear here.</p>
          })()}
        </div>
      </section>
    </>
  )

  const renderJobs = () => (
    <div className="page-panel">
      <div className="panel-header split-header">
        <h2>Find Jobs</h2>
        <button type="button" className="primary-btn">Export Search</button>
      </div>
      <div className="jobs-toolbar">
        <input
          type="text"
          placeholder="Search jobs, companies, skills..."
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
        <select value={jobFilters.location} onChange={(event) => setJobFilters({ ...jobFilters, location: event.target.value })}>
          <option>All</option>
          {jobFilterOptions.location.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={jobFilters.experience} onChange={(event) => setJobFilters({ ...jobFilters, experience: event.target.value })}>
          <option>All</option>
          {jobFilterOptions.experience.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={jobFilters.workMode} onChange={(event) => setJobFilters({ ...jobFilters, workMode: event.target.value })}>
          <option>All</option>
          {jobFilterOptions.workMode.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={jobFilters.type} onChange={(event) => setJobFilters({ ...jobFilters, type: event.target.value })}>
          <option>All</option>
          {jobFilterOptions.type.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <p className="source-note">Live Adzuna listings from up to 30 employers in Bengaluru, Hyderabad, and Chennai within 50 km. Confirm each role is still open on the original listing.</p>
      {jobFeedError && (
        <p className="error-message" role="status">
          Job feed unavailable or using cached results: {jobFeedError}
          <button type="button" className="secondary-btn" onClick={() => setJobRetry((value) => value + 1)}>Retry</button>
        </p>
      )}
      {dataLoading ? (
        <p className="loading-state">Loading jobs…</p>
      ) : filteredJobs.length === 0 ? (
        <div className="empty-state">
          <h3>{jobFeedError ? 'Job listings are temporarily unavailable' : 'No matching jobs found'}</h3>
          <p>{jobFeedError ? 'The job service could not provide listings. Please retry shortly.' : 'Try changing filters or search terms to discover more opportunities.'}</p>
          <button type="button" className="primary-btn" onClick={() => {
            setSearchValue('')
            setJobFilters({ location: 'All', experience: 'All', workMode: 'All', type: 'All' })
          }}>Reset filters</button>
        </div>
      ) : (
        <div className="job-grid list-grid">
          {filteredJobs.map((job) => (
            <article key={job.id} className="job-card compact-job">
              <div className="card-topline">
                <div className="company-mark" style={{ background: job.color }}>{job.company.charAt(0)}</div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={savedJobs.some((savedJob) => savedJob.id === job.id) ? 'Remove saved job' : 'Save job'}
                  onClick={() => toggleSavedJob(job)}
                >{savedJobs.some((savedJob) => savedJob.id === job.id) ? '★' : '☆'}</button>
              </div>
              <h3>{job.title}</h3>
              <p>{job.company}</p>
              <small>Source: {job.sourceName}</small>
              <div className="meta-row"><span>{job.location}</span><span>{job.workMode}</span></div>
              <div className="meta-row small-meta"><span>{job.experience}</span><span>{job.salary}</span></div>
              <div className="skill-tags">{job.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              <div className="card-actions">
                <span>{job.posted}</span>
                <a href={job.jobUrl} target="_blank" rel="noreferrer">Original listing</a>
                <button type="button" className="secondary-btn" onClick={() => openJob(job)}>View Details</button>
                <button type="button" className="primary-btn" onClick={() => openJob(job)}>Apply Now</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )

  const renderApplications = () => (
    <div className="page-panel">
      <div className="panel-header">
        <h2>My Applications</h2>
      </div>
      <div className="stats-grid large-stats">
        {[
          { label: 'Tracked', value: applications.length },
          { label: 'Ready to apply', value: applications.filter((item) => item.status === 'Ready to apply').length },
          { label: 'Shortlisted', value: applications.filter((item) => ['Screening', 'Assessment'].includes(item.status)).length },
          { label: 'Interviews', value: applications.filter((item) => item.status === 'Interview').length },
          { label: 'Offers', value: applications.filter((item) => item.status === 'Offer').length },
        ].map((stat) => (
          <div key={stat.label} className="stat-box">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="pipeline pipeline-wide">
        {['Ready to apply', 'Applied', 'Screening', 'Assessment', 'Interview', 'Offer'].map((step) => (
          <div key={step} className={`pipeline-step ${applications.some((item) => item.status === step) ? 'active' : ''}`}>
            <span>{step}</span>
          </div>
        ))}
      </div>
      {applications.length === 0 ? (
        <div className="empty-state">
          <h3>No applications yet</h3>
          <p>Start applying to jobs and track your progress here.</p>
          <button type="button" className="primary-btn" onClick={() => navigatePage('jobs')}>Find Jobs</button>
        </div>
      ) : (
        <div className="applications-table">
          {applications.map((application) => (
            <div key={`${application.company}-${application.role}`} className="application-row">
              <div>
                <strong>{application.company}</strong>
                <p>{application.role}</p>
              </div>
              <div>
                <span>{application.status === 'Ready to apply' ? 'Tracking started' : 'Applied'}</span>
                <p>{application.date}</p>
              </div>
              <div>
                <span>Status</span>
                <p>{application.status}</p>
              </div>
              <div>
                <span>Next action</span>
                <p>{application.action}</p>
              </div>
              <div>
                <span>Resume</span>
                <p>{application.resume_filename}</p>
              </div>
              {application.application_url && (
                <a href={application.application_url} target="_blank" rel="noopener noreferrer">
                  {application.status === 'Ready to apply' ? 'Continue to employer' : 'Open original posting'}
                </a>
              )}
              <div className="progress-col">
                <span>Progress</span>
                <div className="progress-bar"><span style={{ width: `${application.progress}%` }} /></div>
              </div>
              <div className="status-actions">
                {application.status === 'Ready to apply' && (
                  <button type="button" className="small-btn" onClick={() => updateApplicationStatus(application, 'Applied')}>
                    Mark Applied after submitting
                  </button>
                )}
                <button type="button" className="small-btn" onClick={() => updateApplicationStatus(application, 'Screening')}>Screening</button>
                <button type="button" className="small-btn" onClick={() => updateApplicationStatus(application, 'Assessment')}>Assessment</button>
                <button type="button" className="small-btn" onClick={() => updateApplicationStatus(application, 'Interview')}>Interview</button>
                <button type="button" className="small-btn" onClick={() => updateApplicationStatus(application, 'Offer')}>Offer</button>
                <button type="button" className="small-btn" onClick={() => updateApplicationStatus(application, 'Rejected')}>Rejected</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderSaved = () => (
    <div className="page-panel">
      <div className="panel-header">
        <h2>Saved Jobs</h2>
      </div>
      {savedJobs.length === 0 ? (
      <div className="empty-state">
        <h3>No saved jobs yet</h3>
        <p>Save interesting roles and they will be collected here for later.</p>
        <button type="button" className="primary-btn" onClick={() => navigatePage('jobs')}>Explore Jobs</button>
      </div>
      ) : (
      <div className="saved-list">
        {savedJobs.map((job) => (
          <div key={`${job.company}-${job.title}`} className="saved-item">
            <div>
              <strong>{job.title}</strong>
              <p>{job.company} • {job.location}</p>
            </div>
            <div>
              <span>Work mode</span>
              <p>{job.workMode}</p>
            </div>
            <div>
              <span>Saved</span>
              <p>{job.saved}</p>
            </div>
            <div className="module-actions right-actions">
              <button type="button" className="primary-btn" onClick={() => openJob(job)}>Apply Now</button>
              <button type="button" className="secondary-btn" onClick={() => toggleSavedJob(job)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  )

  const renderLearning = () => (
    <div className="page-panel">
      <div className="panel-header">
        <h2>Learning</h2>
      </div>
      <div className="card-grid three-col">
        {[
          ['Frontend Foundations', 'React, accessibility, and modern UI patterns', '8 lessons'],
          ['Data & SQL Essentials', 'Build confidence with analysis and databases', '6 lessons'],
          ['Interview-ready Python', 'Core language concepts and problem solving', '10 lessons'],
        ].map(([title, description, lessons]) => (
          <article className="module-card" key={title}>
            <h3>{title}</h3>
            <p>{description}</p>
            <div className="meta-row"><span>{lessons}</span><span>Self-paced</span></div>
            <button type="button" className="primary-btn" onClick={() => setToast('Learning modules are coming soon.')}>View learning path</button>
          </article>
        ))}
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="page-panel">
      <div className="panel-header">
        <h2>Settings</h2>
      </div>
      <div className="card-panel settings-card">
        <div>
          <h3>Appearance</h3>
          <p>Choose the theme that feels right for your workspace.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={toggleTheme}>
          Switch to {theme === 'dark' ? 'light' : 'dark'} mode
        </button>
      </div>
      <div className="card-panel settings-card">
        <div>
          <h3>Account</h3>
          <p>Signed in as {user.email}</p>
        </div>
        <button type="button" className="secondary-btn" onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}>Sign out</button>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activePage) {
      case 'jobs':
        return renderJobs()
      case 'applications':
        return renderApplications()
      case 'aptitude':
        return <PracticePage page="aptitude" token={token} progress={practiceProgress} refreshProgress={refreshProgress} setToast={setToast} />
      case 'coding':
        return <PracticePage page="coding" token={token} progress={practiceProgress} refreshProgress={refreshProgress} setToast={setToast} />
      case 'interview':
        return <PracticePage page="interview" token={token} progress={practiceProgress} refreshProgress={refreshProgress} setToast={setToast} />
      case 'resume':
        return profile
          ? <ResumeBuilderPage profile={profile} user={user} token={token} setProfile={setProfile} setToast={setToast} />
          : dataLoading
            ? <p className="loading-state">Loading your resume…</p>
            : <div className="empty-state"><h3>Unable to load your resume</h3><p>Refresh the page to try again.</p></div>
      case 'skills':
        return <SkillAssessmentPage progress={practiceProgress} />
      case 'saved':
        return renderSaved()
      case 'profile':
        return profile
          ? <ProfilePage profile={profile} setProfile={setProfile} token={token} setToast={setToast} />
          : dataLoading
            ? <p className="loading-state">Loading your profile…</p>
            : <div className="empty-state"><h3>Unable to load your profile</h3><p>Refresh the page to try again.</p></div>
      case 'learning':
        return renderLearning()
      case 'settings':
        return renderSettings()
      default:
        return renderDashboard()
    }
  }

  return (
    <div className="careerforge-app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="logo-wrap">
          <div className="brand-mark">C</div>
          <div>
            <strong>CareerForge</strong>
            <small>Career OS</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.id} type="button" className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => navigatePage(item.id)}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-mini">
            <div className="mini-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <strong>{user.name}</strong>
              <span>Profile {profile?.profile_completion ?? 0}% complete</span>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}>Logout</button>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setSidebarOpen((value) => !value)}>☰</button>
          <div className="search-wrap">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search jobs, companies, skills..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigatePage('jobs')
              }}
            />
          </div>
          <button type="button" className="icon-btn theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="top-actions">
            <button type="button" className="icon-btn">🔔</button>
            <button type="button" className="icon-btn">❔</button>
            <div className="user-pill">
              <div className="mini-avatar small-avatar">{user.name.charAt(0).toUpperCase()}</div>
              <span>{user.name.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        <main className="content-area">
          {resumeNotice && <p className="source-note" role="status">{resumeNotice}</p>}
          {renderContent()}
        </main>
      </div>

      {selectedJob && (
        <div className="modal-backdrop" onClick={() => setSelectedJob(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header split-header">
              <h2>{selectedJob.title}</h2>
              <button type="button" className="icon-btn" onClick={() => setSelectedJob(null)}>✕</button>
            </div>
            <div className="job-details-body">
              <div className="detail-row">
                <span>Company</span>
                <strong>{selectedJob.company}</strong>
              </div>
              <div className="detail-row">
                <span>Location</span>
                <strong>{selectedJob.location}</strong>
              </div>
              <div className="detail-row">
                <span>Salary</span>
                <strong>{selectedJob.salary}</strong>
              </div>
              <div className="detail-row">
                <span>Experience</span>
                <strong>{selectedJob.experience}</strong>
              </div>
              <div className="detail-row">
                <span>Type</span>
                <strong>{selectedJob.type}</strong>
              </div>
              <p className="job-copy">{selectedJob.description}</p>
              {selectedJob.responsibilities?.some(Boolean) && <>
                <h3>Responsibilities</h3>
                <ul className="mini-list">{selectedJob.responsibilities.filter(Boolean).map((item) => <li key={item}>{item}</li>)}</ul>
              </>}
              {selectedJob.requirements?.some(Boolean) && <>
                <h3>Requirements</h3>
                <ul className="mini-list">{selectedJob.requirements.filter(Boolean).map((item) => <li key={item}>{item}</li>)}</ul>
              </>}
              <div className="detail-row">
                <span>Listing source</span>
                <strong>{selectedJob.companyInfo}</strong>
              </div>
              <a href={selectedJob.jobUrl} target="_blank" rel="noreferrer">View original posting at {selectedJob.sourceName}</a>
              <div className="tag-row wrap-row">
                {selectedJob.skills.map((skill) => (
                  <span key={skill} className="chip-tag">{skill}</span>
                ))}
              </div>
            </div>
            {(applicationStarted || applications.find((item) => item.job_id === selectedJob.id)) ? (
              <div className="apply-form application-ready-panel" role="status">
              <h3>
                {(applicationStarted || applications.find((item) => item.job_id === selectedJob.id)).status === 'Ready to apply'
                  ? 'Tracking saved — application not submitted'
                  : 'Application tracker'}
              </h3>
              <p>
                {(applicationStarted || applications.find((item) => item.job_id === selectedJob.id)).status === 'Ready to apply'
                  ? 'CareerForge has not sent your resume or personal details to the employer. Review the employer site and choose whether to submit your application there.'
                  : 'This status is recorded from your update. CareerForge has not submitted or independently verified an external application.'}
              </p>
                <p>Selected resume: <strong>{(applicationStarted || applications.find((item) => item.job_id === selectedJob.id)).resume_filename}</strong></p>
                <a
                  href={(applicationStarted || applications.find((item) => item.job_id === selectedJob.id)).application_url || selectedJob.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-btn"
                >
                  Continue to employer site
                </a>
                {(applicationStarted || applications.find((item) => item.job_id === selectedJob.id)).status === 'Ready to apply' && (
                  <p>You can mark this as Applied in your tracker after you submit it on the employer site.</p>
                )}
              </div>
            ) : (
              <form className="apply-form" onSubmit={handleApply}>
                <p className="application-honesty-note">
                  No authorized employer submission integration is configured. Apply on the original employer page;
                  CareerForge will only create a tracking record and will not transmit your resume or personal details.
                </p>
                {(profile?.resumes ?? []).length > 0 ? (
                  <>
                    <label className="application-resume-select">
                      Resume to use
                      <select
                        aria-label="Resume to use"
                        value={selectedResumeId}
                        onChange={(event) => setSelectedResumeId(event.target.value)}
                        required
                      >
                        {(profile.resumes ?? []).map((resume) => (
                          <option key={resume.id} value={resume.id}>
                            {resume.filename}{resume.is_current ? ' (current)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="consent-checkbox application-sharing-confirmation">
                      <input
                        aria-label="Confirm before continuing to employer"
                        type="checkbox"
                        checked={externalSharingConfirmed}
                        onChange={(event) => setExternalSharingConfirmed(event.target.checked)}
                      />
                      <span>
                        I confirm I want to continue to the employer site. CareerForge will not send this resume
                        or my personal details; I will review the employer page and choose whether to share them there.
                      </span>
                    </label>
                    <div className="module-actions">
                      <button
                        type="submit"
                        className="primary-btn"
                        disabled={!selectedResumeId || !externalSharingConfirmed || submittingApplication}
                      >
                        {submittingApplication ? 'Saving tracker…' : 'Apply Now'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>Upload a resume to continue</h3>
                    <p>Your resume is stored privately and is not shared by CareerForge.</p>
                    <button type="button" className="secondary-btn" onClick={() => {
                      setSelectedJob(null)
                      navigatePage('profile')
                    }}>Go to Profile</button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  )
}

export default App
